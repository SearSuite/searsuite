import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { SheetFindContent, type SheetFindMatch, type SheetReplaceInput, type SheetReplaceOneInput } from './FindReplaceTypes';
import {
  createSheetTextMatcher, forEachSheetFindCell, readFindText, resolveSheetFindRanges,
} from './findSheetMatches';
import { replaceRichTextMatches } from './replaceRichTextMatches';
import { type SheetFindReplaceSource } from './SheetFindReplaceSource';
import { SheetFindReplaceError, SheetFindReplaceErrorCode } from './SheetFindReplaceError';

/** Builds one operation per changed cell for a single undoable transaction. */
export function replaceSheetMatches(
  input: SheetReplaceInput | SheetReplaceOneInput,
  source: SheetFindReplaceSource,
  one: boolean,
): UpdateCellOTOperation<CellMatrixElement | null>[] {
  if (!input.text) return [];
  const scanText = createSheetTextMatcher(input);
  const operations: UpdateCellOTOperation<CellMatrixElement | null>[] = [];
  if (one) {
    const selected = (input as SheetReplaceOneInput).match;
    const ranges = resolveSheetFindRanges(input, source);
    if (!ranges.some((range) => selected.row >= range.start[0] && selected.row <= range.end[0] &&
      selected.column >= range.start[1] && selected.column <= range.end[1]) ||
      !Number.isSafeInteger(selected.row) || !Number.isSafeInteger(selected.column)) return operations;
    const previous = source.matrix.getItem(selected.row, selected.column);
    const original = readFindText(previous, selected.row, selected.column, input, source);
    if (original !== selected.text) return operations;
    let valid = false;
    scanText(original, (start, end) => {
      if (start === selected.start && end === selected.end) valid = true;
    });
    if (!valid) return operations;
    const updated = original.slice(0, selected.start) + input.replacement + original.slice(selected.end);
    appendReplacement(operations, input, source, previous, selected.row, selected.column, original, updated, [selected]);
    return operations;
  }

  forEachSheetFindCell(input, source, (previous, row, column) => {
    const original = readFindText(previous, row, column, input, source);
    if (original === null) return;
    const richText = (input.content ?? SheetFindContent.Value) === SheetFindContent.Value &&
      previous?.type === CellType.RichText;
    const richMatches: SheetFindMatch[] = [];
    const parts: string[] = [];
    let cursor = 0;
    let found = false;
    scanText(original, (start, end) => {
      found = true;
      parts.push(original.slice(cursor, start), input.replacement);
      cursor = end;
      if (richText) richMatches.push({ row, column, start, end, text: original });
    });
    if (!found) return;
    parts.push(original.slice(cursor));
    appendReplacement(operations, input, source, previous, row, column, original, parts.join(''), richMatches);
  });
  return operations;
}

function appendReplacement(
  operations: UpdateCellOTOperation<CellMatrixElement | null>[],
  input: SheetReplaceInput, source: SheetFindReplaceSource, previous: CellMatrixElement | null,
  row: number, column: number, original: string, updated: string, richMatches: readonly SheetFindMatch[],
): void {
  if (updated === original) return;
  if ((input.content ?? SheetFindContent.Value) === SheetFindContent.Value &&
    source.isCoveredMergeCell?.(row, column)) {
    throw new SheetFindReplaceError(SheetFindReplaceErrorCode.CoveredMergeCell,
      'Hidden cells inside a merged range cannot be replaced by displayed value', { row, column });
  }
  if ((input.content ?? SheetFindContent.Value) === SheetFindContent.Value &&
    (previous === null || source.isArrayResultAnchor?.(row, column))) {
    throw new SheetFindReplaceError(SheetFindReplaceErrorCode.CalculatedResult,
      'Calculated result cells cannot be replaced directly', { row, column });
  }
  const validation = source.inputValidation?.validate(row, column, updated);
  if (validation?.reject) {
    throw new SheetFindReplaceError(SheetFindReplaceErrorCode.InvalidReplacement,
      validation.message ?? 'Invalid cell value', { row, column });
  }
  let next: CellMatrixElement | null;
  if ((input.content ?? SheetFindContent.Value) === SheetFindContent.Formula && previous) {
    next = { ...previous, formula: updated };
  } else if (previous?.type === CellType.RichText &&
    (input.content ?? SheetFindContent.Value) === SheetFindContent.Value) {
    next = replaceRichTextMatches(previous, richMatches, input.replacement);
  } else {
    next = source.commitStrategies.commit({ row, col: column, plainText: updated, richText: [], previous });
  }
  operations.push(createUpdateCellOTOperation([row, column], next, previous));
}
