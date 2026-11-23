import { type DataEngine } from '../../DataEngine';
import { SheetDataFieldNamespace } from '../../SheetDataView';
import { type SheetMatrix } from '../../SheetMatrix';

/** DataEngine field owned by SheetDataPlugin. */
export const SheetDataMatrixFieldKey = 'sheet.data';

/** Reads the persisted cell matrix published by SheetDataPlugin. */
export function readSheetDataMatrix(dataEngine: DataEngine): SheetMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<SheetMatrix>(SheetDataFieldNamespace, SheetDataMatrixFieldKey) ?? null;
}
