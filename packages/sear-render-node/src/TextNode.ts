import { SearError } from '@searsuite/sear-foundation-error';
import { RenderContext } from '@searsuite/sear-render-context';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { createFontDescriptor, TextShaper } from '@searsuite/sear-render-metrics';

import { type ClipRegion } from './Node';
import { RenderNode } from './RenderNode';
import { type NodeProperties } from './types';
import {
  createGeneralNumberDisplayCandidates,
  SheetHorizontalAlignment,
  SheetVerticalAlignment,
} from '@searsuite/sear-domain-cell-types';
import { HexColor } from '@searsuite/sear-foundation-utils';
import { RichDocNode as RichTextContentNode, computeFirstBaselineY, paraText } from '@searsuite/sear-domain-doc';
import { Platform } from '@searsuite/sear-foundation-platform';
import { type Container } from '@searsuite/sear-foundation-di';
import { type SheetConfig } from '@searsuite/sear-assembly-config';

/** Scene node that renders plain text derived from string or rich-text content. */
export class TextNode<T extends NodeProperties> extends RenderNode<T> {
  /** Text value rendered by this node. */
  public readonly value: string | RichTextContentNode;
  /** Text draws above the box background by default. */
  public override depth: number = 1;
  #measuredWidth: number | null = null;

  /** Returns measured text width once attached, otherwise the declared width. */
  public override get width(): number {
    return this.#measuredWidth ?? super.width;
  }

  /**
   * Constructs a text node and measures its width against the active render context.
   * @param value - Text or rich-text value to render.
   * @param positionRect - Initial node bounds.
   * @param properties - Render properties inherited from the parent cell.
   */
  constructor(
    value: string | RichTextContentNode,
    positionRect: ConstructorParameters<typeof RenderNode>[0],
    properties: Partial<T>,
    runtime?: Container,
  ) {
    // Committed rich text can arrive as structured nodes; flatten to plain text for display.
    const normalizedValue: string | RichTextContentNode = Array.isArray(value) ? value.map(paraText).join('\n') : value;
    value = normalizedValue;

    super(
      positionRect && properties.textOverflowWidth !== undefined
        ? { ...positionRect, width: properties.textOverflowWidth }
        : positionRect,
      properties,
    );
    this.depth = (properties.depth ?? 0) + 1;
    this.value = value || '';
    if (runtime) this.bindRuntime(runtime);
  }

  /** Measures text after the node is attached to its editor-local scene runtime. */
  protected override onRuntimeBound(): void {
    if (typeof this.value !== 'string' && typeof this.value !== 'number') return;
    const textShaper = this.resolveRuntime<TextShaper>(TextShaper.symbol);
    const config = this.configEngine.getDefaultConfig() as Partial<SheetConfig>;
    const font = createSheetCellFont(config);
    this.#measuredWidth = textShaper.shape({ text: String(this.value), font }).width;
  }

  /**
   * Draws text inside the parent node using the parent's alignment and padding.
   * @param context - Render context receiving text commands.
   * @param clipRegion - Optional clipping region inherited from render strategies.
   */
  public drawScene(context: RenderContext, clipRegion?: ClipRegion): void {
    if (this.properties.hideText) return;
    if (!this.parentKey) throw new SearError('TextNode must have a parentKey');

    const parent = this.dataStorage.get(this.parentKey);
    if (!parent) {
      this.resolveRuntime<Platform>(Platform.symbol).warn('TextNode drawScene skipped: parent node is missing.', {
        parentKey: this.parentKey,
        nodeName: this.name,
      });
      return;
    }

    // if (!parent) throw new SearError('Parent node not found');
    const { x, y, width, height, horizontalAlign, verticalAlign } = parent;
    const contentInsetStart = this.properties.contentInsetStart ?? 0;
    const contentInsetEnd = this.properties.contentInsetEnd ?? 0;
    const config = this.configEngine.getDefaultConfig() as Partial<SheetConfig>;
    const cellPadding = config.cellPadding ?? 4;
    const sheetCellFont = createSheetCellFont(config);

    context.save();

    if (clipRegion) {
      if (Array.isArray(clipRegion)) {
        if (clipRegion.length >= 3) {
          context.beginPath();
          context.moveTo(clipRegion[0][0], clipRegion[0][1]);
          for (let i = 1; i < clipRegion.length; i++) {
            context.lineTo(clipRegion[i][0], clipRegion[i][1]);
          }
          context.closePath();
          context.clip();
        }
      } else {
        context.beginPath();
        context.rect(clipRegion.x, clipRegion.y, clipRegion.width, clipRegion.height);
        context.clip();
      }
    }
    if (this.properties.textOverflowWidth !== undefined) {
      context.beginPath();
      context.rect(x, y, this.properties.textOverflowWidth, height);
      context.clip();
    }
    if (contentInsetEnd) {
      context.beginPath();
      context.rect(x, y, Math.max(0, width - contentInsetEnd), height);
      context.clip();
    }

    if (typeof this.value === 'string' || typeof this.value === 'number') {
      const textShaper = this.resolveRuntime<TextShaper>(TextShaper.symbol);
      const availableWidth = Math.max(0, width - 2 * cellPadding - contentInsetStart - contentInsetEnd);
      const lines = String(this.value).split('\n');
      if (lines.length > 1) {
        const verticalPadding = 2;
        const fontSize = Math.max(
          6,
          Math.min(config.sheetCellFontSize ?? 10, (height - verticalPadding * 2) / (lines.length * 1.2)),
        );
        const multilineFont = createFontDescriptor({
          fontSize,
          fontFamily: config.sheetCellFontFamily ?? 'sans-serif',
        });
        context.setFont(multilineFont);
        if (this.properties.textColor) context.setFillStyle(this.properties.textColor);
        const ascent = textShaper.shape({ text: lines[0] || ' ', font: multilineFont }).fontAscent ?? fontSize;
        const lineHeight = Math.min(fontSize * 1.2, (height - verticalPadding * 2) / lines.length);
        lines.forEach((line, index) => {
          const metrics = textShaper.shape({ text: line, font: multilineFont });
          let lineX = x + cellPadding + contentInsetStart;
          if (horizontalAlign === SheetHorizontalAlignment.Center) lineX += (availableWidth - metrics.width) / 2;
          else if (horizontalAlign === SheetHorizontalAlignment.Right)
            lineX = Math.max(lineX, x + width - cellPadding - contentInsetEnd - metrics.width);
          context.fillText(line, lineX, y + verticalPadding + ascent + index * lineHeight, availableWidth);
        });
        context.restore();
        return;
      }
      const fittedText = fitGeneralNumber(
        String(this.value),
        this.properties.fitNumberValue,
        availableWidth,
        sheetCellFont,
        textShaper,
      );
      const text = expandFillCharacter(
        fittedText,
        this.properties.textFillCharacter,
        availableWidth,
        sheetCellFont,
        textShaper,
      );
      const metrics = textShaper.shape({
        text,
        font: sheetCellFont,
      });

      let textX = x + cellPadding + contentInsetStart;
      if (horizontalAlign === SheetHorizontalAlignment.Center) {
        textX = x + cellPadding + contentInsetStart + (availableWidth - metrics.width) / 2;
      } else if (horizontalAlign === SheetHorizontalAlignment.Right) {
        textX = Math.max(x + cellPadding + contentInsetStart, x + width - cellPadding - contentInsetEnd - metrics.width);
      }

      const fontAscent = metrics.fontAscent ?? metrics.height;
      const lineHeight = metrics.height;
      const textY = computeSheetCellBaselineY(
        verticalAlign ?? SheetVerticalAlignment.Center,
        height,
        cellPadding,
        fontAscent,
        lineHeight,
        y,
      );

      context.setFont(sheetCellFont);
      if (this.properties.textColor) context.setFillStyle(this.properties.textColor);
      if (contentInsetStart || contentInsetEnd) context.fillText(text, textX, textY, availableWidth);
      else context.fillText(text, textX, textY);
    }

    context.restore();
  }

  /** Text nodes do not draw separate hit regions; the parent box owns hit testing. */
  public drawHit(context: RenderContext): void {}

  /** Text nodes are cleared through their parent box dirty region. */
  public clear(context: RenderContext): void {}
}

function fitGeneralNumber(
  fallback: string,
  value: number | undefined,
  availableWidth: number,
  font: string,
  textShaper: TextShaper,
): string {
  if (value === undefined) return fallback;
  const candidates = createGeneralNumberDisplayCandidates(value);
  return candidates.find((candidate) => textShaper.shape({ text: candidate, font }).width <= availableWidth) ?? '#';
}

function expandFillCharacter(
  text: string,
  fillCharacter: string | undefined,
  availableWidth: number,
  font: string,
  textShaper: TextShaper,
): string {
  if (!fillCharacter || !text.includes(fillCharacter)) return text;
  const textWidth = textShaper.shape({ text, font }).width;
  const fillWidth = textShaper.shape({ text: fillCharacter, font }).width;
  if (fillWidth <= 0 || textWidth >= availableWidth) return text;
  const repeatCount = 1 + Math.floor((availableWidth - textWidth) / fillWidth);
  return text.replace(fillCharacter, fillCharacter.repeat(repeatCount));
}

function computeSheetCellBaselineY(
  verticalAlign: SheetVerticalAlignment,
  boxHeight: number,
  cellPadding: number,
  fontAscent: number,
  lineHeight: number,
  offsetY: number,
): number {
  if (verticalAlign === SheetVerticalAlignment.Center) {
    return computeFirstBaselineY(boxHeight, cellPadding, fontAscent, lineHeight, offsetY);
  }
  const descent = Math.max(0, lineHeight - fontAscent);
  if (verticalAlign === SheetVerticalAlignment.Bottom) return offsetY + boxHeight - cellPadding - descent;
  return offsetY + cellPadding + fontAscent;
}

function createSheetCellFont(config: Partial<SheetConfig>): string {
  return createFontDescriptor({
    fontSize: config.sheetCellFontSize ?? 10,
    fontFamily: config.sheetCellFontFamily ?? 'sans-serif',
  });
}
