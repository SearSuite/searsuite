import { type RichTextInlineStyle } from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';
import { StandardColor } from '@searsuite/sear-foundation-utils';
import { RenderContext } from '@searsuite/sear-render-context';

import { RichTextRunRenderRegistry } from './RichTextRunRenderRegistry';

/** Paints one contiguous rich-text run using the registered render contributions. */
@Injectable()
export class RichTextRunRenderer {
  readonly #registry: RichTextRunRenderRegistry;

  /** DI token for resolving the run renderer. */
  public static readonly symbol = Symbol.for('RichTextRunRenderer');
  /** Creates a run renderer backed by the render contribution registry. */
  public constructor(registry: RichTextRunRenderRegistry) {
    this.#registry = registry;
  }

  /** Paints one run and restores all renderer state changed by its style plugins. */
  public paint(
    context: RenderContext,
    input: {
      readonly text: string;
      readonly style: RichTextInlineStyle | undefined;
      readonly font: string;
      readonly x: number;
      readonly baselineY: number;
      readonly width: number;
      readonly height: number;
      readonly fontAscent: number;
      readonly fontDescent: number;
    },
  ): void {
    if (!input.text) return;
    context.save();
    context.setFillStyle(StandardColor.Black);
    context.setStrokeStyle(StandardColor.Black);
    context.setFont(this.#registry.resolveFont(input.font, input.style));
    this.#registry.applyRenderState(context, input.style);
    context.fillText(input.text, input.x, input.baselineY);
    this.#registry.paintRun({ context, ...input });
    context.restore();
  }
}
