import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { RenderContext } from '@searsuite/sear-render-context';
import { type RichTextInlineStyle } from '@searsuite/sear-domain-doc';

/** Geometry and render state for one contiguous rich-text run. */
export interface RichTextRunPaintInput {
  readonly context: RenderContext;
  readonly text: string;
  readonly style: RichTextInlineStyle | undefined;
  readonly x: number;
  readonly baselineY: number;
  readonly width: number;
  readonly height: number;
  readonly fontAscent: number;
  readonly fontDescent: number;
}

/** Plugin-owned render behavior for one inline text-style concern. */
export interface RichTextRunRenderContribution {
  /** Stable contribution key used for duplicate detection and unregister. */
  readonly key: string;
  /** Resolves the font used by shaping and painting for a styled run. */
  resolveFont?(input: { readonly font: string; readonly style: RichTextInlineStyle | undefined }): string;
  /** Applies renderer state before the text run is painted. */
  applyRenderState?(input: { readonly context: RenderContext; readonly style: RichTextInlineStyle | undefined }): void;
  /** Paints plugin-owned details for an already painted text run. */
  paintRun?(input: RichTextRunPaintInput): void;
}

/** Render-layer registry for plugin-owned rich-text run behavior. */
@Injectable()
export class RichTextRunRenderRegistry {
  /** DI token for resolving the rich-text run render registry. */
  public static readonly symbol = Symbol.for('RichTextRunRenderRegistry');

  readonly #contributions = new Map<string, RichTextRunRenderContribution>();
  #assertWrite: (() => void) | null = null;

  public enforceWriteBoundary(assertWrite: () => void): void {
    if (this.#assertWrite) throw new SearError('Rich-text run render write boundary is already installed.');
    this.#assertWrite = assertWrite;
    Object.freeze(this);
  }

  /** Registers one render contribution. */
  public register(contribution: RichTextRunRenderContribution): () => void {
    this.#assertWrite?.();
    const key = contribution.key;
    if (this.#contributions.has(key)) {
      throw new SearError(`Rich-text run render contribution "${contribution.key}" already exists.`);
    }
    const registration = Object.freeze({
      key,
      ...(contribution.resolveFont ? { resolveFont: contribution.resolveFont } : {}),
      ...(contribution.applyRenderState ? { applyRenderState: contribution.applyRenderState } : {}),
      ...(contribution.paintRun ? { paintRun: contribution.paintRun } : {}),
    });
    this.#contributions.set(key, registration);
    return () => {
      this.#assertWrite?.();
      if (this.#contributions.get(key) === registration) this.#contributions.delete(key);
    };
  }

  /** Resolves the final font descriptor after all registered contributions run. */
  public resolveFont(font: string, style: RichTextInlineStyle | undefined): string {
    let resolvedFont = font;
    for (const contribution of this.#contributions.values()) {
      resolvedFont = contribution.resolveFont?.({ font: resolvedFont, style }) ?? resolvedFont;
    }
    return resolvedFont;
  }

  /** Applies all registered render-state contributions before text painting. */
  public applyRenderState(context: RenderContext, style: RichTextInlineStyle | undefined): void {
    for (const contribution of this.#contributions.values()) {
      contribution.applyRenderState?.({ context, style });
    }
  }

  /** Paints all registered plugin-owned run details. */
  public paintRun(input: RichTextRunPaintInput): void {
    for (const contribution of this.#contributions.values()) contribution.paintRun?.(input);
  }
}
