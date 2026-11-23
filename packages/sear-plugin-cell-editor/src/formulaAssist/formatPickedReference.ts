import type { Point } from '@searsuite/sear-foundation-rect';
import { columnIndexToLabel } from '@searsuite/sear-foundation-utils';

export type PickedReferenceKind = 'cell' | 'row' | 'column';

/** Formats a selected grid rectangle or header span as an A1 reference. */
export function formatPickedReference(
  start: Point,
  end: Point,
  sheetName?: string,
  kind: PickedReferenceKind = 'cell',
): string {
  const firstRow = Math.min(start[0], end[0]);
  const lastRow = Math.max(start[0], end[0]);
  const firstCol = Math.min(start[1], end[1]);
  const lastCol = Math.max(start[1], end[1]);
  const first = kind === 'row' ? String(firstRow + 1) : kind === 'column'
    ? columnIndexToLabel(firstCol) : `${columnIndexToLabel(firstCol)}${firstRow + 1}`;
  const last = kind === 'row' ? String(lastRow + 1) : kind === 'column'
    ? columnIndexToLabel(lastCol) : `${columnIndexToLabel(lastCol)}${lastRow + 1}`;
  const prefix =
    sheetName === undefined
      ? ''
      : `${/^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheetName) ? sheetName : `'${sheetName.replace(/'/g, "''")}'`}!`;
  return `${prefix}${kind === 'cell' && first === last ? first : `${first}:${last}`}`;
}

/** Finds a sheet qualifier immediately before a formula reference insertion point. */
export function findTrailingSheetQualifierStart(text: string, caret: number): number | null {
  if (caret < 1 || caret > text.length) return null;
  const match = /(?:'(?:(?:[^']|'')+)'|[A-Za-z_][A-Za-z0-9_.]*)!$/.exec(text.slice(0, caret));
  if (!match) return null;
  const start = match.index;
  return start > 0 && /[=+\-*/^&<>(:,;{]/.test(text[start - 1]!) ? start : null;
}

/** A grid pick is available only while the caret is outside formula text literals. */
export function canPickFormulaReference(text: string, caret: number): boolean {
  if (!text.startsWith('=') || caret < 1 || caret > text.length) return false;
  let quote: '"' | "'" | null = null;
  for (let index = 1; index < caret; index += 1) {
    const char = text[index];
    if (quote) {
      if (char !== quote) continue;
      if (text[index + 1] === quote) index += 1;
      else quote = null;
    } else if (char === '"' || char === "'") quote = char;
  }
  return quote === null;
}

/** A new grid reference can start only where the formula expects an operand. */
export function canStartFormulaReferencePick(text: string, selectionStart: number, selectionEnd: number): boolean {
  if (selectionStart !== selectionEnd || !canPickFormulaReference(text, selectionEnd)) return false;
  const beforeCaret = text.slice(0, selectionEnd).trimEnd();
  return /(?:^=|[+\-*/^&=<>(:,;{!])$/.test(beforeCaret);
}
