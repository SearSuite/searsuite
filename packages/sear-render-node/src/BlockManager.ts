import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { TextShaper } from '@searsuite/sear-render-metrics';
import {
  RichDocNode,
  RichTextInlineStyleRegistry,
  RichTextLineBoxRegistry,
  defaultRichTextParagraphLayoutDefaults,
  resolveRichTextParagraphLayout,
  isTextNode,
  type RichTextBlockLayoutProvider,
  type RichTextChar,
  type RichTextInlineStyle,
  type RichTextLine,
  type RichTextLineSpacing,
  type RichTextParagraphLayoutDefaults,
  type TextNode as RichDocTextNode,
} from '@searsuite/sear-domain-doc';
import { RichTextRunRenderRegistry } from './RichTextRunRenderRegistry';
import { SearError } from '@searsuite/sear-foundation-error';

/** Measures rich-document blocks and produces wrapped rich-text layout lines. */
@Injectable()
export class BlockManager implements RichTextBlockLayoutProvider {
  /** DI token for resolving the rich-document block manager. */
  public static readonly symbol = Symbol.for('BlockManager');

  readonly #textShaper: TextShaper;
  readonly #inlineStyleRegistry: RichTextInlineStyleRegistry;
  readonly #runRenderRegistry: RichTextRunRenderRegistry;
  readonly #lineBoxRegistry: RichTextLineBoxRegistry;
  readonly #paragraphLayoutDefaults: RichTextParagraphLayoutDefaults;
  #baseFont: string | undefined;
  #isCommandExecuting: (() => boolean) | undefined;

  /** Closes direct block writes after the owning editor has assembled. */
  public enforceCommandBoundary(isCommandExecuting: () => boolean): void {
    if (this.#isCommandExecuting) throw new SearError('Block command boundary is already installed.');
    this.#isCommandExecuting = isCommandExecuting;
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Block changes must run through editor.commands.run(...).');
    }
  }

  #blocks: RichDocNode[] | RichDocTextNode[] = [];
  #blocksMeasureInfo: { width: number; height: number }[] = [];

  /** Maximum measured unwrapped block width. */
  public maxWidth: number = 0;

  /** Returns the size of the measured blocks before wrapping. */
  public getUnwrappedSize(): { width: number; height: number } {
    return {
      width: this.maxWidth,
      height: this.#blocksMeasureInfo.reduce((sum, block) => sum + block.height, 0),
    };
  }

  /** Creates a block manager from the text-shaping and rich-text services. */
  constructor(
    @Inject(TextShaper.symbol) textShaper: TextShaper,
    @Inject(RichTextInlineStyleRegistry.symbol)
    inlineStyleRegistry: RichTextInlineStyleRegistry,
    @Inject(RichTextRunRenderRegistry.symbol)
    runRenderRegistry: RichTextRunRenderRegistry,
    @Inject(RichTextLineBoxRegistry.symbol)
    lineBoxRegistry: RichTextLineBoxRegistry,
    baseFont?: string,
    paragraphLayoutDefaults: RichTextParagraphLayoutDefaults = defaultRichTextParagraphLayoutDefaults,
  ) {
    this.#textShaper = textShaper;
    this.#inlineStyleRegistry = inlineStyleRegistry;
    this.#lineBoxRegistry = lineBoxRegistry;
    this.#paragraphLayoutDefaults = paragraphLayoutDefaults;
    this.#runRenderRegistry = runRenderRegistry;
    this.#baseFont = baseFont;
  }

  /** Creates an unshared measurement workspace for a read-only layout request. */
  public createDetached(): BlockManager {
    return new BlockManager(
      this.#textShaper,
      this.#inlineStyleRegistry,
      this.#runRenderRegistry,
      this.#lineBoxRegistry,
      this.#baseFont,
      this.#paragraphLayoutDefaults,
    );
  }

  /** Adds a rich document block and records its measured size. */
  add(node: RichDocNode): void {
    this.#assertCommandWrite();
    this.#blocks.push(node);
    this.#measureNode(node);
  }

  /** Clears all measured blocks and cached size information. */
  clear(): void {
    this.#assertCommandWrite();
    this.#blocks = [];
    this.#blocksMeasureInfo = [];
    this.maxWidth = 0;
  }

  /** Selects the transient base font used for the next layout pass. */
  public setBaseFont(font: string): void {
    this.#assertCommandWrite();
    this.#baseFont = font;
  }

  #measureNodeChars(node: RichDocNode): RichTextChar[] {
    return (node.content as Array<RichDocNode | RichDocTextNode>).flatMap((child, childIndex) => {
      if (!isTextNode(child)) return [];
      return this.#measureWords(child.text ?? '', this.#inlineStyleRegistry.readTextNodeStyle(child), childIndex);
    });
  }

  #measureNode(node: RichDocNode): void {
    const words = this.#measureNodeChars(node);
    this.#blocksMeasureInfo.push({
      width: words.reduce((sum, w) => sum + w.width, 0),
      height: words.reduce((max, w) => Math.max(max, w.height), 0),
    });
    this.maxWidth = Math.max(this.maxWidth, this.#blocksMeasureInfo[this.#blocksMeasureInfo.length - 1].width);
  }

  #measureWords(text: string, style?: RichTextInlineStyle, textNodeIndex?: number): RichTextChar[] {
    const sourceText = text || ' ';
    const font = this.#runRenderRegistry.resolveFont(this.#baseFont ?? '16px sans-serif', style);
    const shaped = this.#textShaper.shape({ text: sourceText, font });
    const caretByOffset = new Map(shaped.caretStops.map((stop) => [stop.textOffset, stop.x]));
    const ranges =
      shaped.clusters.length > 0
        ? shaped.clusters.map((cluster) => ({ start: cluster.textStart, end: cluster.textEnd }))
        : tokenizeGraphemes(sourceText).map((word, index, all) => {
            const start = all.slice(0, index).join('').length;
            return { start, end: start + word.length };
          });
    const height = Math.max(1, shaped.height);
    const ascent = shaped.fontAscent ?? height;
    const descent = shaped.fontDescent ?? Math.max(0, height - ascent);
    const chars = ranges.map((range) => {
      const startX = caretByOffset.get(range.start) ?? 0;
      const endX = caretByOffset.get(range.end) ?? startX;
      return this.#createChar(
        text ? sourceText.slice(range.start, range.end) : '',
        Math.max(0, endX - startX),
        height,
        ascent,
        descent,
        shaped.fontLineGap,
        style,
        textNodeIndex,
        range.start,
      );
    });
    if (!text) return [this.#createChar('', 0, height, ascent, 0, undefined, style, textNodeIndex, 0)];
    return chars;
  }

  #createChar(
    char: string,
    width: number,
    height: number,
    fontAscent: number,
    fontDescent: number,
    fontLineGap: number | undefined,
    style?: RichTextInlineStyle,
    textNodeIndex?: number,
    textNodeOffset?: number,
  ): RichTextChar {
    return {
      char,
      width,
      height,
      fontAscent,
      fontDescent,
      ...(fontLineGap !== void 0 ? { fontLineGap } : {}),
      ...(style ? { style } : {}),
      ...(textNodeIndex !== void 0 ? { textNodeIndex } : {}),
      ...(textNodeOffset !== void 0 ? { textNodeOffset } : {}),
    };
  }

  /** Calculates a flattened list of wrapped rich-text lines for all blocks. */
  public calculateLayout(width: number): RichTextLine[] {
    return this.#blocks
      .map((block) => {
        const paragraphLayout = resolveRichTextParagraphLayout(block, this.#paragraphLayoutDefaults);
        const words = this.#measureNodeChars(block);
        return this.#wrapLines(words, width, paragraphLayout.lineSpacing);
      })
      .flat();
  }

  /** Calculates wrapped rich-text lines per paragraph while preserving paragraph mapping. */
  public calculateLayoutPerParagraph(width: number): RichTextLine[][] {
    return this.#blocks.map((block) => {
      const paragraphLayout = resolveRichTextParagraphLayout(block, this.#paragraphLayoutDefaults);
      const words = this.#measureNodeChars(block);
      const lines = this.#wrapLines(words, width, paragraphLayout.lineSpacing);
      const defaultChars = this.#measureWords(' ');
      const emptyLineBox = this.#lineBoxRegistry.resolve({
        chars: defaultChars,
        lineSpacing: paragraphLayout.lineSpacing,
      });
      return lines.length > 0
        ? lines
        : [
            {
              chars: [],
              width: 0,
              height: this.#defaultLineHeight(),
              fontAscent: this.#defaultFontAscent(),
              fontDescent: Math.max(0, this.#defaultLineHeight() - this.#defaultFontAscent()),
              lineBox: emptyLineBox,
            },
          ];
    });
  }

  #defaultLineHeight(): number {
    const words = this.#measureWords(' ');
    return words[0]?.height ?? 14;
  }

  #defaultFontAscent(): number {
    const words = this.#measureWords(' ');
    return words[0]?.fontAscent ?? this.#defaultLineHeight();
  }

  #wrapLines(chars: RichTextChar[], maxWidth: number, lineSpacing: RichTextLineSpacing): RichTextLine[] {
    const lines: RichTextLine[] = [];
    let line: typeof chars = [];
    let lineWidth = 0;
    let maxHeight = 0;
    let maxFontAscent = 0;

    chars.forEach((word) => {
      if (lineWidth + word.width > maxWidth && line.length > 0) {
        if (isPunctuation(word.char) && line.length > 0) {
          line.push(word);
          lineWidth += word.width;
          maxHeight = Math.max(maxHeight, word.height);
          maxFontAscent = Math.max(maxFontAscent, word.fontAscent);
          lines.push(this.#createLine(line, lineWidth, maxHeight, maxFontAscent, lineSpacing));
          line = [];
          lineWidth = 0;
          maxHeight = 0;
          maxFontAscent = 0;
        } else {
          lines.push(this.#createLine(line, lineWidth, maxHeight, maxFontAscent, lineSpacing));
          line = [word];
          lineWidth = word.width;
          maxHeight = word.height;
          maxFontAscent = word.fontAscent;
        }
      } else {
        line.push(word);
        lineWidth += word.width;
        maxHeight = Math.max(maxHeight, word.height);
        maxFontAscent = Math.max(maxFontAscent, word.fontAscent);
      }
    });
    if (line.length > 0) lines.push(this.#createLine(line, lineWidth, maxHeight, maxFontAscent, lineSpacing));
    return lines;
  }

  #createLine(
    chars: RichTextChar[],
    width: number,
    height: number,
    fontAscent: number,
    lineSpacing: RichTextLineSpacing,
  ): RichTextLine {
    const fontDescent = chars.reduce(
      (max, char) => Math.max(max, char.fontDescent ?? Math.max(0, char.height - char.fontAscent)),
      0,
    );
    const lineBox = this.#lineBoxRegistry.resolve({ chars, lineSpacing });
    return { chars, width, height, fontAscent, fontDescent, lineBox };
  }
}

function isPunctuation(ch: string): boolean {
  return /\p{P}/u.test(ch);
}

function tokenizeGraphemes(text: string, locale: string = 'default'): string[] {
  const internationalization = Intl as typeof Intl & {
    Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => {
      segment(input: string): Iterable<{ segment: string }>;
    };
  };
  if (typeof internationalization.Segmenter === 'function') {
    const segmenter = new internationalization.Segmenter(locale, {
      granularity: 'grapheme',
    });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }
  return [text];
}
