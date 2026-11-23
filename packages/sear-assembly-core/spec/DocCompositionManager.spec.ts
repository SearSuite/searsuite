import { DocCompositionManager, NoopDocCompositionProvider } from '../src';

function createShaper() {
  return {
    shape: jest.fn(({ text }: { text: string }) => ({
      glyphs: [],
      clusters: [{ textStart: 0, textEnd: text.length, glyphStart: 0, glyphEnd: 0 }],
      caretStops: Array.from({ length: text.length + 1 }, (_, offset) => ({ textOffset: offset, x: offset * 2 })),
      width: text.length * 2,
      height: 10,
    })),
  };
}

function createRenderContext() {
  return {
    measureText: jest.fn((text: string) => ({
      width: text.length * 2,
      height: 10,
      fontAscent: 8,
      fontDescent: 2,
    })),
    save: jest.fn(),
    restore: jest.fn(),
    setTransform: jest.fn(),
    setFillStyle: jest.fn(),
    fillText: jest.fn(),
    setStrokeStyle: jest.fn(),
    setLineWidth: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
  };
}

describe('DocCompositionManager', () => {
  it('measures active composition text and caret offset', () => {
    const manager = new DocCompositionManager(createShaper() as never);

    manager.setText('inputing', 2);
    const layout = manager.measure('16px sans-serif');

    expect(layout).toEqual({ active: true, text: 'inputing', textWidth: 16, caretPixelOffset: 4 });
    expect(manager.getText()).toBe('inputing');
    expect(manager.getCaretOffset()).toBe(2);
    expect(manager.getCaretPixelOffset()).toBe(4);
  });

  it('clears composition state', () => {
    const manager = new DocCompositionManager(createShaper() as never);
    manager.setText('abc', 1);
    manager.measure('16px sans-serif');

    manager.clear();

    expect(manager.getText()).toBe('');
    expect(manager.getCaretOffset()).toBe(0);
    expect(manager.measure('16px sans-serif')).toEqual({ active: false, text: '', textWidth: 0, caretPixelOffset: 0 });
  });

  it('keeps retained runtime properties from bypassing command dispatch', () => {
    const manager = new DocCompositionManager(createShaper() as never);
    manager.setText('saved', 2);
    manager.enforceCommandBoundary(() => false);

    expect((manager as unknown as Record<string, unknown>)['text']).toBeUndefined();
    expect(() => { (manager as unknown as Record<string, unknown>)['text'] = 'forged'; }).toThrow();
    expect(() => manager.setText('forged')).toThrow('editor.commands.run');
    expect(manager.getText()).toBe('saved');
  });

  it('provides a noop implementation for hosts without composition support', () => {
    const provider = new NoopDocCompositionProvider();

    expect(provider.measure('16px sans-serif')).toEqual({
      active: false,
      text: '',
      textWidth: 0,
      caretPixelOffset: 0,
    });
  });
});
