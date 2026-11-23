import {
  createFormulaError,
  FormulaErrorCode,
  FormulaRangeSourceKind,
  type FormulaReferenceResolutionOptions,
  type ResolvedFormulaRange,
  type FormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { parseCellRef } from '@searsuite/sear-domain-formula-engine-ts';

/** Resolves text references against the current Sheet's finite document shape. */
export function resolveSheetFormulaTextReference(
  text: string,
  options: FormulaReferenceResolutionOptions | undefined,
  shape: readonly [number, number],
): ResolvedFormulaRange | FormulaError {
  const source = text.trim();
  let first: readonly [number, number];
  let last: readonly [number, number];
  if (options?.style === 'R1C1') {
    const parts = source.split(':');
    if (parts.length < 1 || parts.length > 2) return referenceError();
    const start = parseR1C1(parts[0]!, options);
    const end = parseR1C1(parts[1] ?? parts[0]!, options);
    if (!start || !end) return referenceError();
    first = start;
    last = end;
  } else {
    const match = /^(\$?[A-Z]{1,3}\$?[1-9]\d*)(?::(\$?[A-Z]{1,3}\$?[1-9]\d*))?$/i.exec(source);
    if (!match) return referenceError();
    const start = parseCellRef(match[1]!);
    const end = parseCellRef(match[2] ?? match[1]!);
    first = [start.row, start.col];
    last = [end.row, end.col];
  }
  const startRow = Math.min(first[0], last[0]);
  const endRow = Math.max(first[0], last[0]);
  const startCol = Math.min(first[1], last[1]);
  const endCol = Math.max(first[1], last[1]);
  if (startRow < 0 || endRow >= shape[0] || startCol < 0 || endCol >= shape[1]) return referenceError();
  return { source: { kind: FormulaRangeSourceKind.CurrentSheet }, startRow, startCol, endRow, endCol };
}

function parseR1C1(text: string, options: FormulaReferenceResolutionOptions): readonly [number, number] | null {
  const match = /^R(\[-?\d+\]|\d*)C(\[-?\d+\]|\d*)$/i.exec(text);
  if (!match) return null;
  const row = axis(match[1]!, options.currentCell?.row);
  const col = axis(match[2]!, options.currentCell?.col);
  return row === null || col === null ? null : [row, col];
}

function axis(part: string, current: number | undefined): number | null {
  if (part.startsWith('[') && part.endsWith(']')) return current === undefined ? null : current + Number(part.slice(1, -1));
  if (part === '') return current ?? null;
  return Number(part) - 1;
}

function referenceError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Reference);
}
