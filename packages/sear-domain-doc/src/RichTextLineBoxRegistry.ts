import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type RichTextChar, type RichTextLineBox } from './RichTextLayout';
import { type RichTextLineSpacing } from './RichTextParagraphLayout';

/** Input used to resolve the flow box for one measured rich-text line. */
export interface RichTextLineBoxResolveInput {
  readonly chars: readonly RichTextChar[];
  readonly lineBox: RichTextLineBox;
  readonly lineSpacing?: RichTextLineSpacing;
}

/** Plugin-owned contribution that can refine rich-text line flow metrics. */
export interface RichTextLineBoxContribution {
  /** Stable contribution key used for duplicate detection and unregister. */
  readonly key: string;
  /** Resolves the next line box from the current accumulated line box. */
  resolve(input: RichTextLineBoxResolveInput): RichTextLineBox;
}

/** Ordered registry for plugin-owned rich-text line box resolution. */
@Injectable()
export class RichTextLineBoxRegistry {
  /** DI token for resolving the rich-text line box registry. */
  public static readonly symbol = Symbol.for('RichTextLineBoxRegistry');

  readonly #contributions = new Map<string, RichTextLineBoxContribution>();
  #assertWrite: (() => void) | null = null;

  public enforceWriteBoundary(assertWrite: () => void): void {
    if (this.#assertWrite) throw new SearError('Rich-text line box write boundary is already installed.');
    this.#assertWrite = assertWrite;
    Object.freeze(this);
  }

  /** Registers one plugin-owned line box contribution. */
  public register(contribution: RichTextLineBoxContribution): () => void {
    this.#assertWrite?.();
    const key = contribution.key;
    if (this.#contributions.has(key)) {
      throw new SearError(`Rich-text line box contribution "${contribution.key}" already exists.`);
    }
    const registration = Object.freeze({ key, resolve: contribution.resolve });
    this.#contributions.set(key, registration);
    const registry = this;
    return function unregisterRichTextLineBoxContribution(): void {
      registry.#assertWrite?.();
      if (registry.#contributions.get(key) === registration) registry.#contributions.delete(key);
    };
  }

  /** Resolves the final line box for one measured line. */
  public resolve(input: {
    readonly chars: readonly RichTextChar[];
    readonly lineSpacing?: RichTextLineSpacing;
  }): RichTextLineBox {
    let lineBox = createDefaultRichTextLineBox(input.chars);
    for (const contribution of this.#contributions.values()) {
      lineBox = normalizeLineBox(contribution.resolve({ ...input, lineBox }));
    }
    return lineBox;
  }
}

/** Creates the default line box contribution used by document composition roots. */
export function createDefaultRichTextLineBoxContribution(): RichTextLineBoxContribution {
  return {
    key: 'text.defaultLineBox',
    resolve(input) {
      return input.lineBox;
    },
  };
}

/** Creates the paragraph-owned line-spacing contribution. */
export function createRichTextLineSpacingContribution(): RichTextLineBoxContribution {
  return {
    key: 'paragraph.lineSpacing',
    resolve(input) {
      return applyLineSpacing(input.lineBox, input.lineSpacing);
    },
  };
}

function applyLineSpacing(lineBox: RichTextLineBox, lineSpacing: RichTextLineSpacing | undefined): RichTextLineBox {
  if (!lineSpacing || lineSpacing.mode === 'auto') return lineBox;
  const value = lineSpacing.value ?? 0;
  const target = lineSpacing.mode === 'multiple' ? lineBox.contentHeight * value : value;
  const lineHeight = lineSpacing.mode === 'atLeast' ? Math.max(lineBox.contentHeight, target) : Math.max(1, target);
  const extra = Math.max(0, lineHeight - lineBox.contentHeight);
  return {
    ...lineBox,
    lineGap: lineSpacing.mode === 'exact' ? 0 : lineBox.lineGap,
    lineHeight,
    leadingTop: Math.floor(extra / 2),
    leadingBottom: extra - Math.floor(extra / 2),
  };
}

function createDefaultRichTextLineBox(chars: readonly RichTextChar[]): RichTextLineBox {
  const ascent = chars.reduce((max, char) => Math.max(max, char.fontAscent), 0);
  const descent = chars.reduce(
    (max, char) => Math.max(max, char.fontDescent ?? Math.max(0, char.height - char.fontAscent)),
    0,
  );
  const lineGap = chars.reduce((max, char) => Math.max(max, char.fontLineGap ?? 0), 0);
  const contentHeight = Math.max(1, ascent + descent, ...chars.map((char) => char.height));
  const lineHeight = Math.max(contentHeight, ascent + descent + lineGap);
  return normalizeLineBox({
    ascent,
    descent,
    lineGap,
    contentHeight,
    lineHeight,
    leadingTop: 0,
    leadingBottom: Math.max(0, lineHeight - contentHeight),
  });
}

function normalizeLineBox(lineBox: RichTextLineBox): RichTextLineBox {
  const ascent = normalizePositiveNumber(lineBox.ascent);
  const descent = normalizePositiveNumber(lineBox.descent);
  const lineGap = normalizePositiveNumber(lineBox.lineGap);
  const contentHeight = Math.max(1, normalizePositiveNumber(lineBox.contentHeight), ascent + descent);
  const lineHeight = Math.max(1, normalizePositiveNumber(lineBox.lineHeight));
  const leadingTop = normalizePositiveNumber(lineBox.leadingTop);
  const leadingBottom = normalizePositiveNumber(lineBox.leadingBottom);
  return { ascent, descent, lineGap, contentHeight, lineHeight, leadingTop, leadingBottom };
}

function normalizePositiveNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
