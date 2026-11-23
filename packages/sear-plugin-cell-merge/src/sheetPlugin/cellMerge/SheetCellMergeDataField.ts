import { type DataEngine, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { type CellMergeMatrix } from '../../CellMergeMatrix';

/** DataEngine field owned by SheetCellMergePlugin. */
export const SheetCellMergeFieldKey = 'sheet.cellMerge';

/** Reads merged-cell state published by SheetCellMergePlugin. */
export function readSheetCellMerges(dataEngine: DataEngine): CellMergeMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<CellMergeMatrix>(SheetDataFieldNamespace, SheetCellMergeFieldKey) ?? null;
}
