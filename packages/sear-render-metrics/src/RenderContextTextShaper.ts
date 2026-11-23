import { type RenderContext } from '@searsuite/sear-render-context';
import { SearError } from '@searsuite/sear-foundation-error';
import { createMeasuredTextShapeResult } from './MeasuredTextShapeResult';
import { TextShaper } from './TextShaper';
import { type NormalizedTextShapeInput } from './TextShaperInput';
import { type TextShapeResult } from './TextShaperTypes';

/** Portable fallback backed by the host's render-neutral text measurements. */
export class RenderContextTextShaper extends TextShaper {
  public constructor(private readonly context: RenderContext) { super(); }

  protected override shapeText(input: NormalizedTextShapeInput): TextShapeResult {
    const unsupportedFeatures = Object.keys(input.features).filter((feature) => feature !== 'kern');
    const kerning = input.features['kern'];
    if (input.language || input.script || unsupportedFeatures.length || Object.keys(input.variations).length ||
      (kerning !== undefined && kerning !== true && kerning !== false && kerning !== 0 && kerning !== 1)) {
      throw new SearError('Render context cannot apply the requested text shaping options.', { input });
    }
    this.context.save();
    try {
      this.context.setFont(input.font);
      const measured = this.context.measureText(input.text);
      return createMeasuredTextShapeResult(input.text, measured,
        (end) => this.context.measureText(input.text.slice(0, end)).width);
    } finally {
      this.context.restore();
    }
  }
}
