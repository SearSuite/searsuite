import { type CellClipboardCodecRegistry, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { type CSRMatrix } from '@searsuite/sear-domain-matrix';
import { SheetFindReplaceError, SheetFindReplaceErrorCode } from './SheetFindReplaceError';
import {
  SheetFindContent, SheetFindOrder, type SheetFindInput, type SheetFindMatch, type SheetFindRange,
} from './FindReplaceTypes';

/** Sparse cells and optional projected values visible to a Sheet search. */
export interface SheetFindSource {
  readonly matrix: CSRMatrix<CellMatrixElement>;
  readonly codecs: Pick<CellClipboardCodecRegistry, 'toPlainText'>;
  readonly readValue?: (row: number, column: number, cell: CellMatrixElement | null) => unknown;
  readonly isArrayResultAnchor?: (row: number, column: number) => boolean;
  readonly isCoveredMergeCell?: (row: number, column: number) => boolean;
  readonly isRowHidden?: (row: number) => boolean;
  readonly forEachProjectedValueInRange?: (
    startRow: number, startColumn: number, endRow: number, endColumn: number,
    visit: (row: number, column: number) => void,
  ) => void;
  readonly getRevision?: () => number;
}

/** Resolves the searched text for one cell. */
export function readFindText(
  cell: CellMatrixElement | null, row: number, column: number,
  input: SheetFindInput, source: SheetFindSource,
): string | null {
  if ((input.content ?? SheetFindContent.Value) === SheetFindContent.Formula) return cell?.formula ?? null;
  const value = source.readValue ? source.readValue(row, column, cell) : cell && source.codecs.toPlainText(cell);
  return value === null || value === undefined ? null : String(value);
}

/** Validates and resolves the inclusive search ranges. */
export function resolveSheetFindRanges(input: SheetFindInput, source: SheetFindSource): readonly SheetFindRange[] {
  const [rows, columns] = source.matrix.shape;
  if (rows === 0 || columns === 0) return [];
  const ranges = input.ranges ?? [input.range ?? { start: [0, 0], end: [rows - 1, columns - 1] }];
  for (const range of ranges) {
    const [firstRow, firstColumn] = range.start;
    const [lastRow, lastColumn] = range.end;
    if (![firstRow, firstColumn, lastRow, lastColumn].every(Number.isSafeInteger) ||
      firstRow < 0 || firstColumn < 0 || lastRow >= rows || lastColumn >= columns ||
      lastRow < firstRow || lastColumn < firstColumn) {
      throw new SheetFindReplaceError(SheetFindReplaceErrorCode.InvalidRange, 'Find range is outside the sheet.', {
        range, shape: [rows, columns],
      });
    }
  }
  return ranges;
}

/** Visits persisted cells and formula projections without probing empty coordinates. */
export function forEachSheetFindCell(
  input: SheetFindInput, source: SheetFindSource,
  visit: (cell: CellMatrixElement | null, row: number, column: number) => void,
): void {
  if (!input.text) return;
  const ranges = resolveSheetFindRanges(input, source);
  const visited = ranges.length > 1 ? new Set<string>() : null;
  const visitOnce = (cell: CellMatrixElement | null, row: number, column: number): void => {
    if ((input.content ?? SheetFindContent.Value) === SheetFindContent.Value &&
      source.isCoveredMergeCell?.(row, column)) return;
    if (visited) {
      const key = `${row}:${column}`;
      if (visited.has(key)) return;
      visited.add(key);
    }
    visit(cell, row, column);
  };
  for (const range of ranges) {
    const [firstRow, firstColumn] = range.start;
    const [lastRow, lastColumn] = range.end;
    source.matrix.forEachStoredInRange(firstRow, firstColumn, lastRow, lastColumn, visitOnce);
    if ((input.content ?? SheetFindContent.Value) === SheetFindContent.Value) {
      source.forEachProjectedValueInRange?.(firstRow, firstColumn, lastRow, lastColumn, (row, column) => {
        if (source.matrix.getItem(row, column) === null) visitOnce(null, row, column);
      });
    }
  }
}

/** Compiles Excel-style wildcards and tilde escapes once for an entire scan. */
export function createSheetTextMatcher(
  input: SheetFindInput,
): (text: string, visit: (start: number, end: number) => void) => void {
  let pattern = '';
  for (let index = 0; index < input.text.length; index += 1) {
    const character = input.text[index];
    if (character === '~' && index + 1 < input.text.length &&
      ['*', '?', '~'].includes(input.text[index + 1])) {
      pattern += escapeRegExp(input.text[++index]);
    } else if (character === '*') {
      pattern += '[\\s\\S]*';
    } else if (character === '?') {
      pattern += '[\\s\\S]';
    } else {
      pattern += escapeRegExp(character);
    }
  }
  const flags = input.matchCase ? 'u' : 'iu';
  const exact = input.entireCell ? new RegExp(`^(?:${pattern})$`, flags) : null;
  const matcher = exact ? null : new RegExp(pattern, `${flags}g`);
  return (text, visit) => {
    if (exact) {
      if (exact.test(text)) visit(0, text.length);
      return;
    }
    matcher!.lastIndex = 0;
    for (let occurrence = matcher!.exec(text); occurrence; occurrence = matcher!.exec(text)) {
      if (occurrence[0].length === 0) {
        matcher!.lastIndex += 1;
        continue;
      }
      visit(occurrence.index, occurrence.index + occurrence[0].length);
    }
  };
}

function escapeRegExp(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Visits every occurrence without retaining a result array. */
export function forEachSheetMatch(
  input: SheetFindInput, source: SheetFindSource, visit: (match: SheetFindMatch) => void,
): void {
  if (!input.text) return;
  const scanText = createSheetTextMatcher(input);
  forEachSheetFindCell(input, source, (cell, row, column) => {
    const text = readFindText(cell, row, column, input, source);
    if (text === null) return;
    scanText(text, (start, end) => visit({ row, column, start, end, text,
      ...(source.isRowHidden?.(row) ? { hidden: true } : {}),
    }));
  });
}

/** Compares occurrences in the requested row or column order. */
export function compareSheetMatches(
  left: Pick<SheetFindMatch, 'row' | 'column' | 'start'>,
  right: Pick<SheetFindMatch, 'row' | 'column' | 'start'>,
  order: SheetFindOrder = SheetFindOrder.Rows,
): number {
  return order === SheetFindOrder.Columns
    ? left.column - right.column || left.row - right.row || left.start - right.start
    : left.row - right.row || left.column - right.column || left.start - right.start;
}

/** Collects all occurrences for callers that need the complete result. */
export function findSheetMatches(input: SheetFindInput, source: SheetFindSource): SheetFindMatch[] {
  const matches: SheetFindMatch[] = [];
  forEachSheetMatch(input, source, (match) => matches.push(match));
  matches.sort((left, right) => compareSheetMatches(left, right, input.order));
  return matches;
}
