import { TextMeasurementManager, TextShaper } from '../src';
import { type NormalizedTextShapeInput } from '../src/TextShaperInput';
import { type TextShapeResult } from '../src/TextShaperTypes';

class RecordingTextShaper extends TextShaper {
  public readonly inputs: NormalizedTextShapeInput[] = [];

  protected shapeText(input: NormalizedTextShapeInput): TextShapeResult {
    this.inputs.push(input);
    return {
      glyphs: [],
      clusters: [],
      caretStops: [],
      width: input.font.length,
      height: 12,
    };
  }
}

describe('TextMeasurementManager', () => {
  it('owns reusable space measurements by font', () => {
    const shaper = new RecordingTextShaper();
    const shape = jest.spyOn(shaper, 'shape');
    const measurements = new TextMeasurementManager(shaper);

    expect(measurements.measureSpace('12px sans-serif')).toBe(measurements.measureSpace('12px sans-serif'));
    expect(measurements.measureSpace('16px serif')).not.toBe(measurements.measureSpace('12px sans-serif'));
    expect(shaper.inputs).toHaveLength(2);

    measurements.clear();
    measurements.measureSpace('12px sans-serif');
    expect(shape).toHaveBeenCalledTimes(3);
    expect(shaper.inputs).toHaveLength(2);
  });
});
