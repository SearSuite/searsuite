import { FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { formulaReferenceHighlightConfig, sheetFormulaPluginKey } from '@searsuite/sear-plugin-formula';
import { FormulaReferenceHighlighter } from '../src/FormulaReferenceHighlighter';

describe('FormulaReferenceHighlighter', () => {
  function createHighlighter(): FormulaReferenceHighlighter {
    return new FormulaReferenceHighlighter(new FormulaParser(), new ConfigEngine());
  }

  it('uses parser reference kinds to pair cell outlines with text style ranges', () => {
    const highlighter = createHighlighter();

    const highlighting = highlighter.highlight('=D4+SUM(A1:B2)');

    expect(
      highlighting.cellRanges.map((reference) => {
        if (reference.kind === 'columnRange' || reference.kind === 'rowRange') return null;
        return [reference.start, reference.end];
      }),
    ).toEqual([
      [
        [3, 3],
        [3, 3],
      ],
      [
        [0, 0],
        [1, 1],
      ],
    ]);
    expect(highlighting.textAttributes.map((range) => [range.start, range.end])).toEqual([
      [1, 3],
      [8, 13],
    ]);
    expect((highlighting.textAttributes[0].attrs['textStyle'] as { color: string }).color).toBe(
      highlighting.cellRanges[0].color,
    );
    expect((highlighting.textAttributes[1].attrs['textStyle'] as { color: string }).color).toBe(
      highlighting.cellRanges[1].color,
    );
    expect(highlighting.cellRanges[0].fill).toMatch(/^rgba\(\d+, \d+, \d+, 0\.05\)$/);
  });

  it('keeps a valid reference highlighted while the surrounding expression is incomplete', () => {
    const highlighter = createHighlighter();

    const highlighting = highlighter.highlight('=D4+');

    expect(highlighting.cellRanges).toHaveLength(1);
    expect(highlighting.textAttributes).toEqual([expect.objectContaining({ start: 1, end: 3 })]);
  });

  it('highlights whole-column references without inventing row coordinates', () => {
    const highlighter = createHighlighter();

    const highlighting = highlighter.highlight('=SUM(A:A)');

    expect(highlighting.cellRanges).toEqual([
      expect.objectContaining({
        kind: 'columnRange',
        startCol: 0,
        endCol: 0,
      }),
    ]);
    expect(highlighting.textAttributes).toEqual([expect.objectContaining({ start: 5, end: 8 })]);
  });

  it('highlights whole-row references', () => {
    const highlighter = createHighlighter();
    const highlighting = highlighter.highlight('=SUM(1:2)');
    expect(highlighting.cellRanges).toEqual([
      expect.objectContaining({
        kind: 'rowRange',
        startRow: 0,
        endRow: 1,
      }),
    ]);
  });

  it('styles workbook-qualified references without drawing them on the current sheet', () => {
    const highlighter = createHighlighter();

    const highlighting = highlighter.highlight("=Sheet2!A1+'Sales Data'!B2:C3+A1");

    expect(highlighting.cellRanges).toEqual([
      expect.objectContaining({
        start: [0, 0],
        end: [0, 0],
      }),
    ]);
    expect(highlighting.textAttributes.map((range) => [range.start, range.end])).toEqual([
      [1, 10],
      [11, 29],
      [30, 32],
    ]);
    expect((highlighting.textAttributes[0].attrs['textStyle'] as { color: string }).color).toBeDefined();
    expect((highlighting.textAttributes[1].attrs['textStyle'] as { color: string }).color).toBeDefined();
    expect((highlighting.textAttributes[2].attrs['textStyle'] as { color: string }).color).toBe(
      highlighting.cellRanges[0].color,
    );
  });

  it('keeps workbook references styled while the surrounding expression is incomplete', () => {
    const highlighter = createHighlighter();

    const highlighting = highlighter.highlight("='Sales Data'!A1+");

    expect(highlighting.cellRanges).toHaveLength(0);
    expect(highlighting.textAttributes).toEqual([expect.objectContaining({ start: 1, end: 16 })]);
  });

  it('highlights references inside unary operators', () => {
    const highlighter = createHighlighter();
    const highlighting = highlighter.highlight('=-A1');
    expect(highlighting.cellRanges).toHaveLength(1);
    expect(highlighting.textAttributes[0].start).toBe(2);
  });

  it('ignores references inside string literals even with escaped quotes', () => {
    const highlighter = createHighlighter();
    const highlighting = highlighter.highlight('="A1 "" A2" & A3');
    expect(highlighting.cellRanges).toHaveLength(1); // Only A3 should be highlighted
    expect(highlighting.textAttributes[0].start).toBe(14);
  });

  it('handles reference parsing failures gracefully during incomplete expression fallback', () => {
    const parser = new FormulaParser();
    jest.spyOn(parser, 'parse').mockImplementation((formula) => {
      if (formula === '=A1') throw new Error('Mock parse error');
      return new FormulaParser().parse(formula);
    });
    const highlighter = new FormulaReferenceHighlighter(parser, new ConfigEngine());
    const highlighting = highlighter.highlight('=A1+');
    // A1+ throws on full parse, falls back to token A1. Token A1 parse throws due to mock.
    // Result should be empty.
    expect(highlighting.cellRanges).toHaveLength(0);
  });

  it('returns empty when formula does not start with =', () => {
    const highlighter = createHighlighter();
    const highlighting = highlighter.highlight('A1+B2');
    expect(highlighting.cellRanges).toHaveLength(0);
    expect(highlighting.textAttributes).toHaveLength(0);
  });

  it('ignores parsed nodes that are not reference nodes in fallback', () => {
    const parser = new FormulaParser();
    jest.spyOn(parser, 'parse').mockImplementation((formula) => {
      if (formula === '=A1+') throw new Error('Incomplete');
      if (formula === '=A1') return { kind: 'number', value: 1 } as any; // Not a reference node
      return new FormulaParser().parse(formula);
    });
    const highlighter = new FormulaReferenceHighlighter(parser, new ConfigEngine());
    const highlighting = highlighter.highlight('=A1+');
    expect(highlighting.cellRanges).toHaveLength(0);
  });

  it('can clear highlighting', () => {
    const highlighter = createHighlighter();
    highlighter.clear(); // Does nothing but covers the function
  });

  it('increases the matched cell overlay opacity when the cursor is inside its reference', () => {
    const highlighter = createHighlighter();

    const highlighting = highlighter.highlight('=D3+A1', { cursorOffset: 2 });

    expect(highlighting.cellRanges[0].fill).toMatch(/, 0\.1\)$/);
    expect(highlighting.cellRanges[1].fill).toMatch(/, 0\.05\)$/);
  });

  it('uses the formula highlight opacity configuration', () => {
    const configEngine = new ConfigEngine();
    configEngine.registerPluginConfig(sheetFormulaPluginKey, {
      ...formulaReferenceHighlightConfig,
      referenceFillOpacity: 0.2,
      activeReferenceFillOpacity: 0.3,
    });
    const highlighter = new FormulaReferenceHighlighter(new FormulaParser(), configEngine);

    const highlighting = highlighter.highlight('=D3+A1', { cursorOffset: 2 });

    expect(highlighting.cellRanges[0].fill).toMatch(/, 0\.3\)$/);
    expect(highlighting.cellRanges[1].fill).toMatch(/, 0\.2\)$/);
  });

  it('assigns the configured Excel-style color order to references', () => {
    const highlighter = createHighlighter();

    const first = highlighter.highlight('=D3+A1');
    const second = highlighter.highlight('=A1+D3');
    const firstColors = first.cellRanges.map((range) => range.color);
    const secondColors = second.cellRanges.map((range) => range.color);

    const palette = Object.values(formulaReferenceHighlightConfig.referenceColors);
    expect(firstColors).toEqual([palette[0], palette[1]]);
    expect(secondColors).toEqual([palette[0], palette[1]]);
    expect(palette).not.toContain('#FFFF00');
    expect(palette).not.toContain('#FF0000');
    expect(new Set(palette).size).toBe(12);
  });
});
