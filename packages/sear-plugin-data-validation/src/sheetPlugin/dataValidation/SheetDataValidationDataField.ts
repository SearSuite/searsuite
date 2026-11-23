import { type DataEngine, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { type DataValidationMatrix } from '../../DataValidationMatrix';

/** Sheet data-view field contributed by the validation plugin. */
export const SheetDataValidationFieldKey = 'sheet.dataValidation';

/** Reads the current validation matrix from the sheet data view. */
export function readSheetDataValidations(dataEngine: DataEngine): DataValidationMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<DataValidationMatrix>(SheetDataFieldNamespace, SheetDataValidationFieldKey) ?? null;
}
