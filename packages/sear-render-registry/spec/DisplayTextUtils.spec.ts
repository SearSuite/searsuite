import { extractRichText, formatFormulaValue } from '@searsuite/sear-domain-cell-types';

describe('display text utilities', () => {
  it('extracts nested rich text and ignores malformed nodes', () => {
    expect(
      extractRichText([
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Second' },
            { type: 'unknown', content: [{ type: 'text', text: '!' }] },
          ],
        },
        null,
      ]),
    ).toBe('First\nSecond!\n');
    expect(extractRichText('not a document')).toBe('');
    expect(extractRichText([{ type: 'paragraph', content: 'not array' }])).toBe('');
  });

  it('formats supported formula values without exposing object coercion', () => {
    expect(formatFormulaValue(null)).toBe('');
    expect(formatFormulaValue(12.5)).toBe('12.5');
    expect(formatFormulaValue(true)).toBe('TRUE');
    expect(formatFormulaValue(false)).toBe('FALSE');
    expect(formatFormulaValue({ kind: 'text', value: 'label' })).toBe('label');
    expect(formatFormulaValue({ kind: 'error', code: '#VALUE!' })).toBe('#VALUE!');
    expect(formatFormulaValue([1, false, 'x'])).toBe('1, FALSE, x');
    expect(formatFormulaValue({ unexpected: 'object' })).toBe('');
    expect(formatFormulaValue({ kind: 'text' })).toBe('');
    expect(formatFormulaValue({ kind: 'error' })).toBe('');
  });
});
