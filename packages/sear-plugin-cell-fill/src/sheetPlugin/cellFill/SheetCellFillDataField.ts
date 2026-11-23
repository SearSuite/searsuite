import { type DataEngine, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { type CellFillMatrix } from '../../CellFillMatrix';

/** DataEngine field owned by SheetCellFillPlugin. */
export const SheetCellFillFieldKey = 'sheet.cellFill';

/** Reads cell fills published by SheetCellFillPlugin. */
export function readSheetCellFills(dataEngine: DataEngine): CellFillMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<CellFillMatrix>(SheetDataFieldNamespace, SheetCellFillFieldKey) ?? null;
}
