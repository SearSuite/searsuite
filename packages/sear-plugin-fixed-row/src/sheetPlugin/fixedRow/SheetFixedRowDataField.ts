import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { type FixedRowMatrix } from '../../FixedRowMatrix';

/** Stable Sheet data-view field owned by SheetFixedRowPlugin. */
export const SheetFixedRowsFieldKey = 'sheet.fixedRows';

/** Reads the fixed-row matrix published by SheetFixedRowPlugin. */
export function readSheetFixedRows(dataEngine: DataEngine): FixedRowMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<FixedRowMatrix>(SheetDataFieldNamespace, SheetFixedRowsFieldKey) ?? null;
}
