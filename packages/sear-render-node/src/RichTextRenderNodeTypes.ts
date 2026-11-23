import { type NodeProperties } from './types';
import { type RichTextInlineStyle } from '@searsuite/sear-domain-doc';

export type { RichTextInlineStyle } from '@searsuite/sear-domain-doc';

/** Stable rich-text block identifier. */
export type RichTextBlockId = string;

/** Render-node properties used by rich-text scene graphs. */
export interface RichTextRenderNodeProperties extends NodeProperties {
  /** Semantic role for rich-text render nodes. */
  readonly renderRole?: 'page' | 'block' | 'line' | 'text-run' | 'selection' | 'caret' | 'composition';
  /** Stable top-level rich-text block id. */
  readonly blockId?: RichTextBlockId;
  /** Top-level rich-text block index. */
  readonly blockIndex?: number;
  /** Layout line index inside the full rich-text snapshot. */
  readonly lineIndex?: number;
}

/** Minimal rich-text character shape consumed by render nodes. */
export interface RichTextRenderChar {
  readonly char: string;
  readonly width: number;
  readonly style?: RichTextInlineStyle;
}

/** Minimal layout-line shape consumed by rich-text render nodes. */
export interface RichTextRenderLine {
  readonly textNodePath: readonly number[];
  readonly charStartOffset: number;
  readonly chars: readonly RichTextRenderChar[];
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly fontAscent: number;
  readonly cursorXOffsets?: readonly number[];
}
