import { RichTextInlineStyleRegistry, type RichTextInlineStyle } from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';

import { type RichTextRenderLine } from './RichTextRenderNodeTypes';
import { RichTextRunRenderer } from './RichTextRunRenderer';

/** Paints laid-out rich-text lines by grouping adjacent characters into runs. */
@Injectable()
export class RichTextLineRenderer {
  /** DI token for resolving the line renderer. */
  public static readonly symbol = Symbol.for('RichTextLineRenderer');
  /** Creates a line renderer with domain style comparison and run rendering. */
  public constructor(
    private readonly inlineStyles: RichTextInlineStyleRegistry,
    private readonly runRenderer: RichTextRunRenderer,
  ) {}

  /** Paints one laid-out line at the supplied world-space origin. */
  public paint(
    context: RenderContext,
    input: {
      readonly line: RichTextRenderLine;
      readonly origin: Pick<PositionRectProps, 'x' | 'y'>;
      readonly font?: string | undefined;
    },
  ): void {
    let runText = '';
    let runStartX = input.line.x;
    let cursorX = runStartX;
    let activeStyle: RichTextInlineStyle | undefined;

    const flushRun = (): void => {
      if (!runText) return;
      this.runRenderer.paint(context, {
        text: runText,
        style: activeStyle,
        font: input.font ?? '16px sans-serif',
        x: input.origin.x + runStartX,
        baselineY: input.origin.y + input.line.y,
        width: cursorX - runStartX,
        height: input.line.height,
        fontAscent: input.line.fontAscent,
        fontDescent: Math.max(0, input.line.height - input.line.fontAscent),
      });
      runText = '';
    };

    for (const char of input.line.chars) {
      const nextStyle = char.style;
      if (!this.inlineStyles.sameStyle(activeStyle, nextStyle)) {
        flushRun();
        activeStyle = nextStyle;
        runStartX = cursorX;
      }
      runText += char.char;
      cursorX += char.width;
    }
    flushRun();
  }
}
