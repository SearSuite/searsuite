import { type RichTextInlineStyle } from './RichTextInlineStyleRegistry';

/** Measured inline character/token used by rich-text line wrapping. */
export type RichTextChar = {
  char: string;
  width: number;
  height: number;
  fontAscent: number;
  fontDescent?: number;
  fontLineGap?: number;
  style?: RichTextInlineStyle;
  /** Direct child index of the source text node within its paragraph. */
  textNodeIndex?: number;
  /** Character offset within the source text node. */
  textNodeOffset?: number;
};

/** Flow metrics for one rich-text line. */
export interface RichTextLineBox {
  readonly ascent: number;
  readonly descent: number;
  readonly lineGap: number;
  readonly contentHeight: number;
  readonly lineHeight: number;
  readonly leadingTop: number;
  readonly leadingBottom: number;
}

/** One laid-out rich-text line with aggregate dimensions. */
export type RichTextLine = {
  chars: RichTextChar[];
  width: number;
  height: number;
  /** Max measured font ascent across all chars on this line; used for stable vertical centering. */
  fontAscent: number;
  /** Max measured font descent across all chars on this line. */
  fontDescent?: number;
  /** Plugin-resolved line box used for flow and baseline placement. */
  lineBox?: RichTextLineBox;
};

/** Domain-side contract for services that provide measured rich-text block layout. */
export interface RichTextBlockLayoutProvider {
  /** Updates the transient font used when measuring unstyled text. */
  setBaseFont?(font: string): void;
  calculateLayoutPerParagraph(width: number): RichTextLine[][];
}
