import { type DataEngine, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { type DuplicateMatrix } from '../../DuplicateMatrix';

/** DataEngine field owned by SheetDuplicatePlugin. */
export const SheetDuplicateFieldKey = 'sheet.duplicateHighlights';

/** Reads duplicate highlights published by SheetDuplicatePlugin. */
export function readSheetDuplicateHighlights(dataEngine: DataEngine): DuplicateMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<DuplicateMatrix>(SheetDataFieldNamespace, SheetDuplicateFieldKey) ?? null;
}
