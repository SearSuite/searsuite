import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { type CellHighlightMatrix } from '../../CellHighlightMatrix';

export const SheetCellHighlightFieldKey = 'sheet.cellHighlight';

export function readSheetCellHighlights(dataEngine: DataEngine): CellHighlightMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<CellHighlightMatrix>(SheetDataFieldNamespace, SheetCellHighlightFieldKey) ?? null;
}
