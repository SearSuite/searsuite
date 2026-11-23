import { HeadlessRenderContext } from '@searsuite/sear-render-context';
import { RenderContextTextShaper } from '../src';

describe('RenderContextTextShaper', () => {
  it('measures complete text and grapheme caret positions through a neutral render context', () => {
    const context = new HeadlessRenderContext();
    const save = jest.spyOn(context, 'save');
    const restore = jest.spyOn(context, 'restore');
    const shaper = new RenderContextTextShaper(context);

    const result = shaper.shape({ text: 'A😀', font: '16px sans-serif' });

    expect(result.width).toBe(3);
    expect(result.caretStops).toEqual([
      { textOffset: 0, x: 0 }, { textOffset: 1, x: 1 }, { textOffset: 3, x: 3 },
    ]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('preserves font metrics supplied by the render context', () => {
    class MeasuredContext extends HeadlessRenderContext {
      public override measureText(text: string) {
        return { width: text.length, height: 12, fontAscent: 9, fontDescent: 3 };
      }
    }
    const result = new RenderContextTextShaper(new MeasuredContext()).shape({
      text: 'A', font: '16px sans-serif', features: { kern: true },
    });
    expect(result).toMatchObject({ height: 12, fontAscent: 9, fontDescent: 3 });
  });

  it.each([
    { features: { liga: true } },
    { language: 'zh' },
    { script: 'Hani' },
    { variations: { wght: 700 } },
    { features: { kern: 2 } },
  ])('rejects shaping options unavailable through the render-neutral contract', (options) => {
    const shaper = new RenderContextTextShaper(new HeadlessRenderContext());
    expect(() => shaper.shape({ text: 'A', font: '16px sans-serif', ...options })).toThrow();
  });
});
