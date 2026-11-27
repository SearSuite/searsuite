import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { type CellFormatMatrix } from '../../CellFormatMatrix';

/** DataEngine field owned by SheetCellFormatPlugin. */
export const SheetCellFormatFieldKey = 'sheet.cellFormat';

/** Reads the live format matrix published by SheetCellFormatPlugin. */
export function readSheetCellFormats(dataEngine: DataEngine): CellFormatMatrix | null {
  return dataEngine.readDataViewField<CellFormatMatrix>(SheetDataFieldNamespace, SheetCellFormatFieldKey) ?? null;
}
