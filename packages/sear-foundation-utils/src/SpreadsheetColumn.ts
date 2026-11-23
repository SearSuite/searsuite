/**
 * Converts an Excel-style column label (A, Z, AA, ...) to a zero-based index.
 *
 * @example
 * columnLabelToIndex('A') // 0
 * columnLabelToIndex('AA') // 26
 */
export function columnLabelToIndex(label: string): number {
  let columnNumber = 0;
  const normalizedLabel = label.toUpperCase();

  for (let index = 0; index < normalizedLabel.length; index++) {
    columnNumber = columnNumber * 26 + normalizedLabel.charCodeAt(index) - 64;
  }

  return columnNumber - 1;
}

/**
 * Converts a zero-based column index to an Excel-style label (A, Z, AA, ...).
 *
 * @example
 * columnIndexToLabel(0) // 'A'
 * columnIndexToLabel(26) // 'AA'
 */
export function columnIndexToLabel(columnIndex: number): string {
  let columnNumber = columnIndex + 1;
  let label = '';

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }

  return label;
}
