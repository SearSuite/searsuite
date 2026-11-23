import {
  TextShaper,
  type TextShapeInput,
  type TextShapeResult,
} from '../src';

class TestTextShaper extends TextShaper {
  public shapeCalls = 0;

  public constructor() {
    super();
  }

  protected shapeText(input: Required<TextShapeInput>): TextShapeResult {
    this.shapeCalls += 1;
    return {
      glyphs: [
        {
          glyphId: 1,
          cluster: 0,
          xAdvance: input.text.length,
          yAdvance: 0,
          xOffset: 0,
          yOffset: 0,
        },
      ],
      clusters: [{ textStart: 0, textEnd: input.text.length, glyphStart: 0, glyphEnd: 1 }],
      caretStops: [{ textOffset: 0, x: 0 }, { textOffset: input.text.length, x: input.text.length }],
      width: input.text.length,
      height: 0,
    };
  }
}

describe('TextShaper', () => {
  it('normalizes requests and caches identical shaping inputs', () => {
    const shaper = new TestTextShaper();
    const first = shaper.shape({
      text: 'AB',
      font: '16px sans-serif',
      features: { kern: true, liga: true },
      variations: { wght: 400 },
    });
    const second = shaper.shape({
      text: 'AB',
      font: '16px sans-serif',
      features: { liga: true, kern: true },
      variations: { wght: 400 },
    });

    expect(shaper.shapeCalls).toBe(1);
    expect(second).toBe(first);
    expect(first.glyphs).toBeDefined();
  });

  it('keeps direction and shaping options in the cache key', () => {
    const shaper = new TestTextShaper();
    const base = { text: 'AB', font: '16px sans-serif' };

    shaper.shape(base);
    shaper.shape({ ...base, direction: 'rtl' });
    shaper.shape({ ...base, features: { kern: false } });
    shaper.shape({ ...base, variations: { wght: 700 } });

    expect(shaper.shapeCalls).toBe(4);
  });

  it('rejects malformed requests and shaping results', () => {
    const shaper = new TestTextShaper();

    expect(() => shaper.shape({ text: 'A', font: '' })).toThrow('font');
    expect(() => shaper.shape({ text: 'A', font: '16px sans-serif', direction: 'bad' as never })).toThrow(
      'direction',
    );

    class InvalidResultShaper extends TextShaper {
      public constructor() {
        super();
      }

      protected shapeText(): TextShapeResult {
        return {
          glyphs: [],
          clusters: [],
          caretStops: [],
          width: -1,
          height: 0,
        };
      }
    }
    expect(() => new InvalidResultShaper().shape({ text: 'A', font: '16px sans-serif' })).toThrow('width');
  });

  it('clears cached shaping results', () => {
    const shaper = new TestTextShaper();
    shaper.shape({ text: 'A', font: '16px sans-serif' });
    shaper.clearCache();
    shaper.shape({ text: 'A', font: '16px sans-serif' });
    expect(shaper.shapeCalls).toBe(2);
  });
});
