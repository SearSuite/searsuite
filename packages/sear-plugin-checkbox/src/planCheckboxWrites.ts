import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { type SheetRangeInput } from '@searsuite/sear-assembly-commands';
import { type SheetCheckboxOptions, type CheckboxCellWrite } from './SheetCheckboxOptions';
import {
  CheckboxCellType,
  CheckboxRemovalMode,
  isCheckboxCell,
  parseCheckboxText,
  checkboxText,
} from './CheckboxCellValue';
import { type InsertCheckboxesInput, type CheckboxRangeStatus } from './CheckboxCommands';
import { CheckboxError, CheckboxErrorCode } from './CheckboxError';
import { CheckboxMutationLimit } from './normalizeCheckboxRange';
/** Reads a source range sparsely, independent of viewport size. */
export function readCheckboxRange(range: SheetRangeInput, source: SheetCheckboxOptions): CheckboxRangeStatus {
  let count = 0,
    checked = 0;
  source.forEachStored(range, (cell) => {
    if (isCheckboxCell(cell)) {
      count++;
      if (cell.value) checked++;
    }
  });
  return { count, checked, unchecked: count - checked, mixed: checked > 0 && checked < count };
}
function write(
  row: number,
  column: number,
  cell: CellMatrixElement | null,
  source: SheetCheckboxOptions,
): CheckboxCellWrite {
  if (isCheckboxCell(cell)) {
    const validation = source.validateValue?.(row, column, checkboxText(cell.value));
    if (validation?.reject)
      throw new CheckboxError(
        CheckboxErrorCode.Conflict,
        validation.message ?? 'Checkbox value conflicts with cell validation.',
        { row, column },
      );
  }
  return { row, column, cell };
}
/** Plans bounded insertion; existing formulas and non-boolean values require explicit replacement. */
export function planInsertCheckboxes(
  input: InsertCheckboxesInput,
  range: SheetRangeInput,
  source: SheetCheckboxOptions,
): CheckboxCellWrite[] {
  if (
    (input.checked !== undefined && typeof input.checked !== 'boolean') ||
    (input.replaceExisting !== undefined && typeof input.replaceExisting !== 'boolean')
  )
    throw new CheckboxError(CheckboxErrorCode.Invalid, 'Invalid checkbox insertion options.');
  const size = (range.focus[0] - range.anchor[0] + 1) * (range.focus[1] - range.anchor[1] + 1);
  if (!Number.isSafeInteger(size) || size > CheckboxMutationLimit)
    throw new CheckboxError(CheckboxErrorCode.Limit, 'Checkbox insertion exceeds the mutation budget.', {
      limit: CheckboxMutationLimit,
    });
  const result: CheckboxCellWrite[] = [];
  for (let row = range.anchor[0]; row <= range.focus[0]; row++)
    for (let column = range.anchor[1]; column <= range.focus[1]; column++) {
      if (source.isMergedCoveredCell?.(row, column)) continue;
      const old = source.readCell(row, column),
        boolean = isCheckboxCell(old)
          ? old.value
          : old?.type === CellType.String && typeof old.value === 'string'
          ? parseCheckboxText(old.value)
          : old?.type !== CellType.Formula && typeof old?.value === 'boolean'
          ? old.value
          : null;
      if (old && boolean === null && !(old.type === CellType.String && old.value === '') && !input.replaceExisting)
        throw new CheckboxError(
          CheckboxErrorCode.Conflict,
          'Selected cells contain non-boolean data. Enable replacement explicitly.',
          { row, column, reason: 'nonBoolean' },
        );
      const value = input.checked ?? boolean ?? false;
      if (isCheckboxCell(old) && old.value === value) continue;
      result.push(
        write(row, column, isCheckboxCell(old) ? { ...old, value } : { type: CheckboxCellType, value }, source),
      );
    }
  return result;
}
/** Plans sparse state changes or removal, preserving all unrelated cell contents. */
export function planCheckboxChanges(
  range: SheetRangeInput,
  source: SheetCheckboxOptions,
  checked: boolean | null,
  remove?: CheckboxRemovalMode,
): CheckboxCellWrite[] {
  if (
    (checked !== null && typeof checked !== 'boolean') ||
    (remove !== undefined && !Object.values(CheckboxRemovalMode).includes(remove))
  )
    throw new CheckboxError(CheckboxErrorCode.Invalid, 'Invalid checkbox update options.');
  const result: CheckboxCellWrite[] = [];
  source.forEachStored(range, (old, row, column) => {
    if (!isCheckboxCell(old)) return;
    const cell =
      remove === CheckboxRemovalMode.Clear
        ? null
        : remove === CheckboxRemovalMode.Text
        ? { type: CellType.String, value: checkboxText(old.value) }
        : { ...old, value: checked ?? !old.value };
    if (!remove && old.value === cell?.value) return;
    if (result.length >= CheckboxMutationLimit)
      throw new CheckboxError(CheckboxErrorCode.Limit, 'Checkbox update exceeds the mutation budget.');
    result.push(write(row, column, cell, source));
  });
  return result;
}
