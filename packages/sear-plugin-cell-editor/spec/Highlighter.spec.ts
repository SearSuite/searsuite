import { Highlighter, type Highlighting } from '../src/Highlighter';

class TestHighlighter extends Highlighter {
  public highlight(text: string): Highlighting {
    return {
      cellRanges: [],
      textAttributes: [{ start: 0, end: text.length, attrs: { textStyle: { color: '#000000' } } }],
    };
  }
}

describe('Highlighter', () => {
  it('provides a no-op cleanup hook for stateless implementations', () => {
    const highlighter = new TestHighlighter();

    expect(highlighter.highlight('A1')).toEqual({
      cellRanges: [],
      textAttributes: [{ start: 0, end: 2, attrs: { textStyle: { color: '#000000' } } }],
    });
    expect(() => highlighter.clear()).not.toThrow();
  });

  it('implements clear() as a no-op by default', () => {
    class TestHighlighter extends Highlighter {
      public highlight() {
        return { cellRanges: [], textAttributes: [] };
      }
    }
    const highlighter = new TestHighlighter();
    expect(() => highlighter.clear()).not.toThrow();
  });
});
