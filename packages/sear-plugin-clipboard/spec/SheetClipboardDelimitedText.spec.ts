import { decodeSheetClipboardText, encodeSheetClipboardText } from '../src/SheetClipboardDelimitedText';

describe('clipboard plain text', () => {
  it('round-trips tabs, line breaks, quotes, and boundary whitespace in cell values', () => {
    const rows = [
      ['A\tB', 'line 1\nline 2', 'say "hello"'],
      [' leading', 'trailing ', ''],
    ];
    expect(decodeSheetClipboardText(encodeSheetClipboardText(rows))).toEqual(rows);
    expect(encodeSheetClipboardText(rows)).toBe('"A\tB"\t"line 1\nline 2"\t"say ""hello"""\n" leading"\t"trailing "\t');
  });

  it('keeps trailing empty fields and rows when parsing external clipboard text', () => {
    expect(decodeSheetClipboardText('A\t\r\n"B\r\nC"\t\r\n')).toEqual([['A', ''], ['B\r\nC', ''], ['']]);
    expect(decodeSheetClipboardText('')).toEqual([]);
  });
});
