import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { assertSheetContributionWrite } from '@searsuite/sear-assembly-plugin';
import { type SheetCommandEffect } from './SheetCommand';

/** Optional consumers of command effects; a state-only host need not install a view. */
@Injectable()
export class SheetCommandEffectRegistry {
  public static readonly symbol = Symbol.for('SheetCommandEffectRegistry');
  readonly #platform: Platform;
  readonly #listeners = new Map<SheetCommandEffect['kind'], Set<(effect: SheetCommandEffect) => void>>();

  public constructor(@Inject(Platform.symbol) platform: Platform) {
    this.#platform = platform;
  }

  public register<Kind extends SheetCommandEffect['kind']>(
    kind: Kind,
    handle: (effect: Extract<SheetCommandEffect, { kind: Kind }>) => void,
  ): () => void {
    assertSheetContributionWrite(this);
    const listener = (effect: SheetCommandEffect) => handle(effect as Extract<SheetCommandEffect, { kind: Kind }>);
    const listeners = this.#listeners.get(kind) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(kind, listeners);
    return () => {
      assertSheetContributionWrite(this);
      listeners.delete(listener);
      if (!listeners.size) this.#listeners.delete(kind);
    };
  }

  /** Delivers host effects after commit; consumer failures cannot undo committed state. */
  public dispatch(effect: SheetCommandEffect): void {
    for (const handle of this.#listeners.get(effect.kind) ?? []) {
      try {
        handle(effect);
      } catch (error) {
        this.#platform.warn('Sheet command effect consumer failed.', error);
      }
    }
  }

  public destroy(): void {
    assertSheetContributionWrite(this);
    this.#listeners.clear();
  }
}
