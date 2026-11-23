import { type DataEngine, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { type CellHighlightMatrix } from '../../CellHighlightMatrix';

export const SheetCellHighlightFieldKey = 'sheet.cellHighlight';

export function readSheetCellHighlights(dataEngine: DataEngine): CellHighlightMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<CellHighlightMatrix>(SheetDataFieldNamespace, SheetCellHighlightFieldKey) ?? null;
}
