import { createUpdateCellOTOperation, type Operation } from '@searsuite/sear-domain-ot';
import { type PluginKey } from './PluginKey';
import { type SheetFormatRange, type SheetFormatTransferPlan } from './SheetFormatTransfer';
import { type SheetFormatMatrix } from './createMatrixFormatTransfer';

/** Clears only explicit persisted entries; inherited defaults remain sparse. */
export function clearMatrixFormats<Value>(
  target: PluginKey,
  matrix: SheetFormatMatrix<Value>,
  range: SheetFormatRange,
): readonly SheetFormatTransferPlan[] {
  const operations: Operation[] = [];
  const defaultValue = matrix.getDefaultValue?.() ?? null;
  matrix.forEachStoredInRange(...range.start, ...range.end, (value, row, column) => {
    if (value == null || JSON.stringify(value) === JSON.stringify(defaultValue)) return;
    operations.push(createUpdateCellOTOperation([row, column], null, JSON.parse(JSON.stringify(value)) as Value));
  });
  return operations.length ? [{ target, operations }] : [];
}
