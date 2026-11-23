import { defineEventObservation } from '@searsuite/sear-foundation-subscription';

export interface DataValidationWarning {
  readonly row: number;
  readonly column: number;
  readonly ruleId: string;
  readonly message: string;
}

export const DataValidationWarningObservation =
  defineEventObservation<DataValidationWarning>('sheet.dataValidation.warning');
