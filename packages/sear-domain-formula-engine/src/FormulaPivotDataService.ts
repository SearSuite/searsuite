import { type FormulaPivotDataQuery } from './FormulaPivotDataQuery';
import { type FormulaValue } from './FormulaValue';

/** Host service used by GETPIVOTDATA. */
export interface FormulaPivotDataService {
  getData(query: FormulaPivotDataQuery): FormulaValue;
}
