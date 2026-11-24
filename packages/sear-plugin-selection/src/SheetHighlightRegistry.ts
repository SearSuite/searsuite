import { SearError } from '@searsuite/sear-foundation-error';
import { SearCoreSheet, runOutsideCommandExecution } from '@searsuite/sear-assembly-core';
import { assertSheetContributionWrite } from '@searsuite/sear-assembly-plugin';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { type Point } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';

/** Viewport-spanning overlay guide anchored to a cell-range edge. */
export const SheetHighlightEdge = { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' } as const;
export type SheetHighlightEdge = (typeof SheetHighlightEdge)[keyof typeof SheetHighlightEdge];

/** A visual-only cell range supplied by an independently registered provider. */
export interface SheetRangeHighlight {
  start: Point;
  end: Point;
  type?: string;
  depth?: number;
  /** Insets the visual box from the resolved cell-range boundary. */
  inset?: number;
  strokeWidth?: number;
  stroke?: string;
  fill?: string;
  skipHit?: boolean;
  /** Paints a transient range above the grid in the final overlay pass. */
  overlay?: boolean;
  edge?: SheetHighlightEdge;
}

/** Read-only sheet state made available to every range-highlight provider. */
export interface SheetHighlightContext {
  searCore: SearCoreSheet;
}

/**
 * Extension point for range decorations such as formula precedents, search
 * results, validation errors, collaboration selections, and audit trails.
 */
export interface SheetHighlightProvider {
  key: string;
  getHighlights(context: SheetHighlightContext): SheetRangeHighlight[];
}

/**
 * Registry for independently replaceable sheet-range highlighters.
 *
 * The registry owns provider activation and change notification; the paired
 * SheetHighlightPlugin owns scene-node creation and teardown.
 */
@Injectable()
export class SheetHighlightRegistry {
  readonly #platform: Platform | undefined;

  /** DI token for resolving SheetHighlightRegistry. */
  public static readonly symbol = Symbol.for('SheetHighlightRegistry');

  readonly #providers = new Map<string, SheetHighlightProvider>();
  readonly #enabled = new Map<string, boolean>();
  readonly #listeners = new Set<() => void>();

  public constructor(@Inject(Platform.symbol) platform?: Platform) {
    this.#platform = platform;
  }

  /** Registers the value. */
  public register(provider: SheetHighlightProvider): () => void {
    assertSheetContributionWrite(this);
    const entry = Object.freeze({ key: provider.key, getHighlights: provider.getHighlights.bind(provider) });
    if (this.#providers.has(entry.key)) {
      throw new SearError(`A sheet highlight provider named "${entry.key}" is already registered.`);
    }
    this.#providers.set(entry.key, entry);
    this.#enabled.set(entry.key, true);
    this.#notify();
    const registry = this;
    return function unregisterSheetHighlightProvider(): void {
      assertSheetContributionWrite(registry);
      if (registry.#providers.get(entry.key) !== entry) return;
      registry.#providers.delete(entry.key);
      registry.#enabled.delete(entry.key);
      registry.#notify();
    };
  }

  /** Updates the enabled. */
  public setEnabled(providerKey: string, enabled: boolean): void {
    assertSheetContributionWrite(this);
    if (!this.#providers.has(providerKey) || this.#enabled.get(providerKey) === enabled) return;
    this.#enabled.set(providerKey, enabled);
    this.#notify();
  }

  /**
   * Requests a new provider evaluation when state read by a provider (for
   * example selection, search terms, or remote cursors) changes externally.
   */
  public invalidate(): void {
    this.#notify();
  }

  /** Returns the highlights. */
  public getHighlights(context: SheetHighlightContext): SheetRangeHighlight[] {
    const highlights: SheetRangeHighlight[] = [];
    this.#providers.forEach((provider, key) => {
      if (this.#enabled.get(key) !== true) return;
      highlights.push(...provider.getHighlights(context));
    });
    return highlights;
  }

  /** Subscribes to state changes and returns an idempotent disposer. */
  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    const registry = this;
    return function unsubscribeSheetHighlightRegistry(): void {
      registry.#listeners.delete(listener);
    };
  }

  #notify(): void {
    runOutsideCommandExecution(() =>
      this.#listeners.forEach((listener) => {
        try {
          listener();
        } catch (error) {
          this.#platform?.warn('Sheet highlight listener failed.', error);
        }
      }),
    );
  }
}
