import { type RichTextInlineStyle } from '@searsuite/sear-domain-doc';
import {
  BoldTextStyleKey,
  FontFamilyTextStyleKey,
  FontSizeTextStyleKey,
  ItalicTextStyleKey,
  StrikethroughTextStyleKey,
  TextColorStyleKey,
  UnderlineTextStyleKey,
} from '@searsuite/sear-assembly-doc';
import { type RichTextRunRenderContribution } from './RichTextRunRenderRegistry';

/** Creates the render-layer bold contribution. */
export function createBoldRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${BoldTextStyleKey.Bold}`,
    resolveFont: ({ font, style }) => resolveBoldFont(font, style),
  };
}

function resolveBoldFont(font: string, style: Readonly<Record<string, unknown>> | undefined): string {
  if (style?.[BoldTextStyleKey.Bold] !== true) return font;
  const weightPattern = /^(?:normal|bold|bolder|lighter|[1-9]00)(\s+)/i;
  return weightPattern.test(font) ? font.replace(weightPattern, 'bold$1') : `bold ${font}`;
}

/** Creates the render-layer font-family contribution. */
export function createFontFamilyRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${FontFamilyTextStyleKey.FontFamily}`,
    resolveFont: ({ font, style }) => resolveFontFamily(font, style),
  };
}

function resolveFontFamily(font: string, style: Readonly<Record<string, unknown>> | undefined): string {
  const family =
    typeof style?.[FontFamilyTextStyleKey.FontFamily] === 'string'
      ? style[FontFamilyTextStyleKey.FontFamily].trim()
      : '';
  if (!family) return font;
  const separator = font.search(/\s/);
  return separator < 0 ? font : `${font.slice(0, separator + 1)}${family}`;
}

/** Creates the render-layer font-size contribution. */
export function createFontSizeRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${FontSizeTextStyleKey.FontSize}`,
    resolveFont: ({ font, style }) => resolveFontSize(font, style),
  };
}

function resolveFontSize(font: string, style: Readonly<Record<string, unknown>> | undefined): string {
  const fontSize = style?.[FontSizeTextStyleKey.FontSize];
  if (typeof fontSize !== 'number' || !Number.isFinite(fontSize) || fontSize <= 0) return font;
  const size = `${fontSize}px`;
  const sizePattern = /^\s*\d*\.?\d+(?:px|pt|pc|in|cm|mm|em|rem|ex|ch|vh|vw|vmin|vmax|%)\b/i;
  return sizePattern.test(font) ? font.replace(sizePattern, size) : `${size} ${font}`;
}

/** Creates the render-layer italic contribution. */
export function createItalicRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${ItalicTextStyleKey.Italic}`,
    resolveFont: ({ font, style }) => resolveItalicFont(font, style),
  };
}

function resolveItalicFont(font: string, style: RichTextInlineStyle | undefined): string {
  if (style?.[ItalicTextStyleKey.Italic] !== true) return font;
  const pattern = /^(?:normal|italic|oblique)(\s+)/i;
  return pattern.test(font) ? font.replace(pattern, 'italic$1') : `italic ${font}`;
}

/** Creates the render-layer strikethrough contribution. */
export function createStrikethroughRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${StrikethroughTextStyleKey.Strikethrough}`,
    paintRun: ({ context, style, x, baselineY, width, height, fontAscent }) => {
      if (style?.[StrikethroughTextStyleKey.Strikethrough] !== true) return;
      context.setLineWidth(Math.max(1, height / 16));
      const strikeY = baselineY - Math.max(1, fontAscent * 0.35);
      context.beginPath();
      context.moveTo(x, strikeY);
      context.lineTo(x + width, strikeY);
      context.stroke();
    },
  };
}

/** Creates the render-layer text-color contribution. */
export function createTextColorRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${TextColorStyleKey.Color}`,
    applyRenderState: applyTextColor,
  };
}

function applyTextColor(input: {
  readonly context: { setFillStyle(fillStyle: string): void; setStrokeStyle?(strokeStyle: string): void };
  readonly style: RichTextInlineStyle | undefined;
}): void {
  const color = input.style?.[TextColorStyleKey.Color];
  if (typeof color === 'string') {
    input.context.setFillStyle(color);
    input.context.setStrokeStyle?.(color);
  }
}

/** Creates the render-layer underline contribution. */
export function createUnderlineRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${UnderlineTextStyleKey.Underline}`,
    paintRun: ({ context, style, x, baselineY, width, height, fontDescent }) => {
      if (style?.[UnderlineTextStyleKey.Underline] !== true) return;
      context.setLineWidth(Math.max(1, height / 16));
      const y = baselineY + Math.max(1, fontDescent * 0.35);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + width, y);
      context.stroke();
    },
  };
}
