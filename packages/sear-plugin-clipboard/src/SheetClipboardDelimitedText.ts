/** Encodes spreadsheet clipboard rows as tab-separated text. */
export function encodeSheetClipboardText(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row
        .map((value) => (/[\t\r\n"]/.test(value) || value.trim() !== value ? `"${value.replace(/"/g, '""')}"` : value))
        .join('\t'),
    )
    .join('\n');
}

/** Decodes tab-separated text, including quoted tabs, line breaks, and escaped quotes. */
export function decodeSheetClipboardText(text: string): string[][] {
  if (text === '') return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let atFieldStart = true;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (char === '\t') {
      row.push(field);
      field = '';
      atFieldStart = true;
    } else if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
      if (char === '\r' && text[index + 1] === '\n') index++;
    } else {
      field += char;
      atFieldStart = false;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}
