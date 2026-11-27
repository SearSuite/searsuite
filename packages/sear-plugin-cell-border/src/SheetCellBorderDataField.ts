import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { type CellBorderMatrix } from './CellBorderMatrix';

/** Stable data-view field owned by the border plugin. */
export const SheetCellBorderFieldKey = 'sheet.cellBorder';
/** Reads the border owner's projection, when that plugin is installed. */
export function readSheetCellBorders(dataEngine: DataEngine): CellBorderMatrix | null {
  return dataEngine.readDataViewField<CellBorderMatrix>(SheetDataFieldNamespace, SheetCellBorderFieldKey) ?? null;
}
