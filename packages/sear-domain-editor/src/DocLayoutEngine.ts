import {
  resolveDocNodeId,
  RichDocNode,
  RichTextBlockFlowRegistry,
  isTextNode,
  type RichTextBlockLayoutProvider,
  type RichTextChar,
  type RichTextLine,
} from '@searsuite/sear-domain-doc';
import { type DocBlockLayout } from './DocLayoutCache';
import { DocCursorPos, DocSelection, isCollapsed, normalizeSelection, compareCursor } from '@searsuite/sear-domain-doc';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';

// ---------------------------------------------------------------------------
// Layout snapshot types
// ---------------------------------------------------------------------------

/**
 * A single wrapped line inside the editor, with full path metadata for
 * bidirectional cursor ↔ pixel coordinate mapping.
 */
export interface LayoutLine {
  /**
   * Full path to the **text node** this line belongs to.
   *
   * For a flat document (paragraph → single text node):
   *   `textNodePath = [paraIndex, 0]`
   *
   * The path mirrors `DocCursorPos.path` semantics: a cursor at
   * `{ path: textNodePath, offset }` lives on this line when
   * `charStartOffset <= offset <= charStartOffset + chars.length`.
   */
  textNodePath: number[];
  /**
   * Char offset (within the text node) of the FIRST character on this line.
   * e.g. if a text node wraps at char 20, the second line has charStartOffset=20.
   */
  charStartOffset: number;
  /** Per-character measurements for this line. */
  chars: RichTextChar[];
  /** Left edge of text, relative to editor box top-left (includes cellPadding). */
  x: number;
  /**
   * Y coordinate used for fillText/cursor drawing, relative to editor box
   * top-left. This is the baseline consumed by document render nodes so cursor
   * pixel coordinates align with rendered text.
   */
  y: number;
  /** Line height in CSS/canvas pixels. */
  height: number;
  /** Font ascent: distance from baseline to top of tallest glyph on this line. */
  fontAscent: number;
  /** Cursor boundary x offsets relative to this line's x, one entry per char boundary. */
  cursorXOffsets?: number[];
}

/** Pre-computed layout for the entire editing session. */
export interface LayoutSnapshot {
  lines: LayoutLine[];
}

/** Materialized layout for a subset of top-level document blocks. */
export interface BlockLayoutSnapshot {
  /** Line snapshot containing only the materialized block ranges. */
  readonly snapshot: LayoutSnapshot;
  /** Block records for the materialized blocks, using full-document indexes. */
  readonly blocks: readonly DocBlockLayout[];
}

/** Vertical positioning strategy for a laid-out document frame. */
export type DocVerticalAlign = 'top' | 'center';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-equal comparison of two integer-array paths. */
function pathEquals(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// DocLayoutEngine
// ---------------------------------------------------------------------------

/**
 * Converts between DocCursorPos (path + char offset) and pixel coordinates
 * (relative to the editor box top-left corner), using rich-text block measurements.
 *
 * Mirrors the Y-positioning formula used by the document render layout so that
 * cursor positions align with rendered glyphs.
 */
@Injectable()
export class DocLayoutEngine {
  readonly #blockFlowRegistry: RichTextBlockFlowRegistry;

  /** DI token for resolving DocLayoutEngine. */
  public static readonly symbol: symbol = Symbol.for('DocLayoutEngine');

  public constructor(
    @Inject(RichTextBlockFlowRegistry.symbol)
    blockFlowRegistry: RichTextBlockFlowRegistry,
  ) {
    this.#blockFlowRegistry = blockFlowRegistry;
  }

  // -----------------------------------------------------------------------
  // buildSnapshot
  // -----------------------------------------------------------------------

  /**
   * Build a LayoutSnapshot from the current blockManager state.
   *
   * Prerequisites: callers must add all document paragraphs to `blockManager`
   * before building the snapshot.
   *
   * @param doc            The current RichDocNode[] being edited.
   * @param blockManager   Layout provider that already holds the paragraph blocks.
   * @param editorWidth    Total pixel width of the editor box (including padding).
   * @param editorHeight   Total pixel height of the editor box (including padding).
   * @param cellPadding    Padding on each side (default 4).
   * @param verticalAlign  Vertical positioning strategy (default center for embedded cell editors).
   */
  public buildSnapshot(
    doc: RichDocNode[],
    blockManager: RichTextBlockLayoutProvider,
    editorWidth: number,
    editorHeight: number,
    cellPadding: number = 4,
    verticalAlign: DocVerticalAlign = 'center',
  ): LayoutSnapshot {
    const contentWidth = Math.max(0, editorWidth - cellPadding * 2);
    const linesPerPara: RichTextLine[][] = blockManager.calculateLayoutPerParagraph(contentWidth);

    // Flatten to compute baselines shared by content and cursor render nodes.
    const flatLines: RichTextLine[] = linesPerPara.flat();

    let currentLineTop = this.#getFirstLineTop(flatLines, editorHeight, cellPadding, verticalAlign, doc);

    const allLines: LayoutLine[] = [];

    for (let paraIndex = 0; paraIndex < linesPerPara.length; paraIndex++) {
      const paraLines = linesPerPara[paraIndex];

      for (let li = 0; li < paraLines.length; li++) {
        const line = paraLines[li];
        const lineBox = getLineBox(line);
        const currentY = getLineBaselineY(currentLineTop, line);
        const lineParts = splitLineByTextNode(line, paraIndex, doc[paraIndex]);
        lineParts.forEach((part) => {
          allLines.push({
            textNodePath: part.textNodePath,
            charStartOffset: part.charStartOffset,
            chars: part.chars,
            x: cellPadding + part.xOffset,
            y: currentY,
            height: lineBox.lineHeight,
            fontAscent: lineBox.ascent,
            cursorXOffsets: buildCursorXOffsets(part.chars),
          });
        });
        if (lineParts.length === 0) {
          const fallbackPath = getFirstTextNodePath(doc[paraIndex], paraIndex);
          allLines.push({
            textNodePath: fallbackPath,
            charStartOffset: 0,
            chars: [],
            x: cellPadding,
            y: currentY,
            height: lineBox.lineHeight,
            fontAscent: lineBox.ascent,
            cursorXOffsets: [0],
          });
        }
        currentLineTop += lineBox.lineHeight;
      }
      currentLineTop += this.#blockFlowRegistry.resolve({
        node: doc[paraIndex],
        index: paraIndex,
        blockCount: doc.length,
      });
    }

    return { lines: allLines };
  }

  /**
   * Builds a snapshot for selected top-level document blocks.
   *
   * The returned lines keep their full-document text paths, but only the
   * requested blocks are materialized. Callers supply each block's document
   * Y-position from a block-height index.
   */
  public buildSnapshotForBlocks(
    doc: RichDocNode[],
    blockManager: RichTextBlockLayoutProvider,
    blockIndexes: readonly number[],
    blockTops: readonly number[],
    editorWidth: number,
    cellPadding: number = 4,
  ): BlockLayoutSnapshot {
    const contentWidth = Math.max(0, editorWidth - cellPadding * 2);
    const linesPerBlock: RichTextLine[][] = blockManager.calculateLayoutPerParagraph(contentWidth);
    const allLines: LayoutLine[] = [];
    const blocks: DocBlockLayout[] = [];

    for (let localBlockIndex = 0; localBlockIndex < blockIndexes.length; localBlockIndex++) {
      const blockIndex = blockIndexes[localBlockIndex];
      const blockTop = blockTops[localBlockIndex] ?? 0;
      const blockLines = linesPerBlock[localBlockIndex] ?? [];
      const lineStart = allLines.length;
      let currentLineTop = blockTop;

      for (let lineIndex = 0; lineIndex < blockLines.length; lineIndex++) {
        const line = blockLines[lineIndex];
        const lineBox = getLineBox(line);
        const currentY = getLineBaselineY(currentLineTop, line);
        const lineParts = splitLineByTextNode(line, blockIndex, doc[blockIndex]);
        lineParts.forEach((part) => {
          allLines.push({
            textNodePath: part.textNodePath,
            charStartOffset: part.charStartOffset,
            chars: part.chars,
            x: cellPadding + part.xOffset,
            y: currentY,
            height: lineBox.lineHeight,
            fontAscent: lineBox.ascent,
            cursorXOffsets: buildCursorXOffsets(part.chars),
          });
        });
        if (lineParts.length === 0) {
          allLines.push({
            textNodePath: getFirstTextNodePath(doc[blockIndex], blockIndex),
            charStartOffset: 0,
            chars: [],
            x: cellPadding,
            y: currentY,
            height: lineBox.lineHeight,
            fontAscent: lineBox.ascent,
            cursorXOffsets: [0],
          });
        }
        currentLineTop += lineBox.lineHeight;
      }

      const lineEnd = allLines.length;
      const blockLineBounds = computeLayoutLineBounds(allLines.slice(lineStart, lineEnd), blockTop);
      const flowHeight =
        computeBlockFlowHeight(blockLines, blockLineBounds.height) +
        this.#blockFlowRegistry.resolve({
          node: doc[blockIndex],
          index: blockIndex,
          blockCount: doc.length,
        });
      blocks.push({
        id: resolveDocNodeId(doc[blockIndex], [blockIndex]),
        index: blockIndex,
        lineStart,
        lineEnd,
        rect: blockLineBounds,
        flowHeight,
      });
    }

    return { snapshot: { lines: allLines }, blocks };
  }

  #getFirstLineTop(
    lines: RichTextLine[],
    editorHeight: number,
    cellPadding: number,
    verticalAlign: DocVerticalAlign,
    doc: readonly RichDocNode[],
  ): number {
    if (verticalAlign === 'top') return cellPadding;
    const totalHeight =
      computeBlockFlowHeight(lines, 0) +
      doc.reduce(
        (height, node, index) => height + this.#blockFlowRegistry.resolve({ node, index, blockCount: doc.length }),
        0,
      );
    return cellPadding + Math.max(0, (editorHeight - cellPadding * 2 - totalHeight) / 2);
  }

  // -----------------------------------------------------------------------
  // cursorToPoint
  // -----------------------------------------------------------------------

  /**
   * Convert a DocCursorPos to pixel coordinates relative to the editor box
   * top-left corner.
   *
   * Returns the position of the cursor bar's horizontal anchor (i.e. the x at
   * which to draw the vertical cursor line, and the y passed to drawCursor),
   * plus the line height needed to size the cursor bar.
   */
  public cursorToPoint(pos: DocCursorPos, snapshot: LayoutSnapshot): { x: number; y: number; height: number } {
    const { path, offset } = pos;

    // Find the line that contains `offset` for the given textNodePath.
    let targetLine: LayoutLine | null = null;
    for (const line of snapshot.lines) {
      if (!pathEquals(line.textNodePath, path)) continue;
      const lineEnd = line.charStartOffset + line.chars.length;
      if (offset >= line.charStartOffset && offset <= lineEnd) {
        targetLine = line;
        // Keep first matching line (cursor at end-of-line stays on current line)
        break;
      }
    }

    // Fallback: last line with matching path
    if (!targetLine) {
      for (let i = snapshot.lines.length - 1; i >= 0; i--) {
        if (pathEquals(snapshot.lines[i].textNodePath, path)) {
          targetLine = snapshot.lines[i];
          break;
        }
      }
    }

    // Absolute fallback: first line
    if (!targetLine) targetLine = snapshot.lines[0];
    if (!targetLine) return { x: 0, y: 0, height: 14 };

    // Sum widths of chars from the line start up to offset
    const charsBeforeCursor = Math.max(0, offset - targetLine.charStartOffset);
    const cursorX = targetLine.x + getCursorXOffset(targetLine, charsBeforeCursor);

    return { x: cursorX, y: targetLine.y, height: targetLine.height };
  }

  // -----------------------------------------------------------------------
  // pointToCursor
  // -----------------------------------------------------------------------

  /**
   * Convert a pixel position (relative to the editor box top-left) to the
   * nearest DocCursorPos.
   *
   * Used for click-to-position-cursor and drag-selection.
   */
  public pointToCursor(px: number, py: number, snapshot: LayoutSnapshot): DocCursorPos {
    if (snapshot.lines.length === 0) {
      return { path: [0, 0], offset: 0 };
    }

    // Find the nearest line by Y distance
    let targetLine = snapshot.lines[0];
    let minDist = Math.abs(snapshot.lines[0].y - py);
    for (const line of snapshot.lines) {
      const dist = Math.abs(line.y - py);
      if (dist < minDist) {
        minDist = dist;
        targetLine = line;
      }
    }

    // A visual line can contain multiple LayoutLine entries when inline
    // styles split one paragraph into several text nodes. Pick the horizontal
    // segment under the pointer before resolving its character boundary.
    const visualLines = snapshot.lines.filter((line) => line.y === targetLine.y);
    for (const line of visualLines) {
      const lineEndX = line.x + getCursorXOffset(line, line.chars.length);
      if (px < line.x || px <= lineEndX) {
        targetLine = line;
        break;
      }
      targetLine = line;
    }

    // Find nearest char boundary within the selected visual-line segment.
    for (let i = 0; i < targetLine.chars.length; i++) {
      const start = getCursorXOffset(targetLine, i);
      const end = getCursorXOffset(targetLine, i + 1);
      if (px <= targetLine.x + (start + end) / 2) {
        return {
          path: targetLine.textNodePath,
          offset: getCharTextOffset(targetLine, i),
        };
      }
    }

    // Clicked past end of line
    return {
      path: targetLine.textNodePath,
      offset: getCharTextOffset(targetLine, targetLine.chars.length),
    };
  }

  // -----------------------------------------------------------------------
  // findLineIndex
  // -----------------------------------------------------------------------

  /**
   * Returns the index into `snapshot.lines` for the line containing `pos`.
   * Returns 0 if not found.
   */
  public findLineIndex(pos: DocCursorPos, snapshot: LayoutSnapshot): number {
    const { path, offset } = pos;
    let best = 0;
    for (let i = 0; i < snapshot.lines.length; i++) {
      const line = snapshot.lines[i];
      if (!pathEquals(line.textNodePath, path)) continue;
      const lineEnd = line.charStartOffset + line.chars.length;
      if (offset >= line.charStartOffset && offset <= lineEnd) {
        best = i;
        break;
      }
    }
    return best;
  }

  // -----------------------------------------------------------------------
  // getSelectionRects
  // -----------------------------------------------------------------------

  /**
   * Compute canvas-space rectangles for a non-collapsed DocSelection.
   *
   * @param sel       The current DocSelection (anchor + head).
   * @param snapshot  Layout snapshot from buildSnapshot.
   * @param originX   Absolute canvas X of the editor box top-left.
   * @param originY   Absolute canvas Y of the editor box top-left.
   * @returns Array of {x,y,width,height} rectangles in canvas coordinates.
   */
  public getSelectionRects(
    sel: DocSelection,
    snapshot: LayoutSnapshot,
    originX: number,
    originY: number,
  ): { x: number; y: number; width: number; height: number }[] {
    if (isCollapsed(sel)) return [];
    const { start, end } = normalizeSelection(sel);
    const rects: { x: number; y: number; width: number; height: number }[] = [];

    for (const line of snapshot.lines) {
      const lineStartPos: DocCursorPos = {
        path: line.textNodePath,
        offset: line.charStartOffset,
      };
      const lineEndPos: DocCursorPos = {
        path: line.textNodePath,
        offset: line.charStartOffset + line.chars.length,
      };

      // Line is entirely after selection end — done
      if (compareCursor(lineStartPos, end) > 0) break;
      // Line is entirely before selection start — skip
      if (compareCursor(lineEndPos, start) < 0) continue;

      // Highlight start offset on this line
      let hlStart = line.charStartOffset;
      if (pathEquals(line.textNodePath, start.path) && start.offset > line.charStartOffset) {
        hlStart = start.offset;
      }

      // Highlight end offset on this line
      let hlEnd = line.charStartOffset + line.chars.length;
      if (pathEquals(line.textNodePath, end.path) && end.offset < hlEnd) {
        hlEnd = end.offset;
      }

      // Compute X pixel positions by summing char widths
      const startCount = Math.min(hlStart - line.charStartOffset, line.chars.length);
      const startX = line.x + getCursorXOffset(line, startCount);

      const endCount = Math.min(hlEnd - line.charStartOffset, line.chars.length);
      const endX = line.x + getCursorXOffset(line, endCount);

      const width = Math.max(2, endX - startX);
      const rectTop = originY + line.y - line.fontAscent;

      rects.push({
        x: originX + startX,
        y: rectTop,
        width,
        height: line.height,
      });
    }

    return rects;
  }
}

function getCharTextOffset(line: LayoutLine, index: number): number {
  if (index < line.chars.length) {
    return (
      line.chars[index].textNodeOffset ??
      line.charStartOffset + line.chars.slice(0, index).reduce((sum, char) => sum + char.char.length, 0)
    );
  }
  const last = line.chars[line.chars.length - 1];
  if (last?.textNodeOffset !== void 0) return last.textNodeOffset + last.char.length;
  return line.charStartOffset + line.chars.reduce((sum, char) => sum + char.char.length, 0);
}

function computeLayoutLineBounds(lines: readonly LayoutLine[], fallbackTop: number) {
  if (lines.length === 0) return { x: 0, y: fallbackTop, width: 0, height: 0 };

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  lines.forEach((line) => {
    const lineLeft = line.x;
    const lineTop = line.y - line.fontAscent;
    const lineRight = line.x + line.chars.reduce((sum, char) => sum + char.width, 0);
    const lineBottom = lineTop + line.height;
    left = Math.min(left, lineLeft);
    top = Math.min(top, lineTop);
    right = Math.max(right, lineRight);
    bottom = Math.max(bottom, lineBottom);
  });

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function computeBlockFlowHeight(lines: readonly RichTextLine[], visualHeight: number): number {
  if (lines.length === 0) return visualHeight;
  return lines.reduce((height, line) => height + getLineBox(line).lineHeight, 0);
}

function getLineBaselineY(lineTop: number, line: RichTextLine): number {
  const lineBox = getLineBox(line);
  return lineTop + lineBox.leadingTop + lineBox.ascent;
}

function getLineBox(line: RichTextLine) {
  if (line.lineBox) return line.lineBox;
  const ascent = line.fontAscent;
  const descent = line.fontDescent ?? Math.max(0, line.height - line.fontAscent);
  const lineHeight = Math.max(line.height, ascent + descent);
  return {
    ascent,
    descent,
    lineGap: 0,
    contentHeight: line.height,
    lineHeight,
    leadingTop: 0,
    leadingBottom: Math.max(0, lineHeight - line.height),
  };
}

interface LayoutLinePart {
  readonly textNodePath: number[];
  readonly charStartOffset: number;
  readonly chars: RichTextChar[];
  readonly xOffset: number;
}

function splitLineByTextNode(
  line: RichTextLine,
  paraIndex: number,
  paragraph: RichDocNode | undefined,
): LayoutLinePart[] {
  const parts: LayoutLinePart[] = [];
  let currentPart: LayoutLinePart | undefined;
  let xOffset = 0;

  line.chars.forEach((char) => {
    const textNodeIndex = char.textNodeIndex ?? getFirstTextNodeIndex(paragraph);
    const textNodePath = [paraIndex, textNodeIndex];
    const charStartOffset = char.textNodeOffset ?? 0;

    if (
      !currentPart ||
      !pathEquals(currentPart.textNodePath, textNodePath) ||
      currentPart.charStartOffset + currentPart.chars.reduce((length, item) => length + item.char.length, 0) !==
        charStartOffset
    ) {
      currentPart = {
        textNodePath,
        charStartOffset,
        chars: [],
        xOffset,
      };
      parts.push(currentPart);
    }

    currentPart.chars.push(char);
    xOffset += char.width;
  });

  return parts;
}

function buildCursorXOffsets(chars: RichTextChar[]): number[] {
  const offsets = [0];
  chars.reduce((cursorX, char) => {
    const nextX = cursorX + char.width;
    offsets.push(nextX);
    return nextX;
  }, 0);
  return offsets;
}

function getCursorXOffset(line: LayoutLine, charCount: number): number {
  const boundedCount = Math.min(Math.max(0, charCount), line.chars.length);
  const boundary = line.cursorXOffsets?.[boundedCount];
  if (boundary !== void 0) return boundary;
  let cursorX = 0;
  for (let i = 0; i < boundedCount; i++) cursorX += line.chars[i].width;
  return cursorX;
}

function getFirstTextNodePath(paragraph: RichDocNode | undefined, paraIndex: number): number[] {
  return [paraIndex, getFirstTextNodeIndex(paragraph)];
}

function getFirstTextNodeIndex(paragraph: RichDocNode | undefined): number {
  const content = paragraph?.content;
  if (!Array.isArray(content)) return 0;
  const index = content.findIndex(isTextNode);
  return index >= 0 ? index : 0;
}
