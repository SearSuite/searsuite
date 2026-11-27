import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { type CellFillMatrix } from '../../CellFillMatrix';

/** DataEngine field owned by SheetCellFillPlugin. */
export const SheetCellFillFieldKey = 'sheet.cellFill';

/** Reads cell fills published by SheetCellFillPlugin. */
export function readSheetCellFills(dataEngine: DataEngine): CellFillMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<CellFillMatrix>(SheetDataFieldNamespace, SheetCellFillFieldKey) ?? null;
}
