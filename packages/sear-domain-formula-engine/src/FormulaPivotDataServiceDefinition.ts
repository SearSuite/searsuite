import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaPivotDataService } from './FormulaPivotDataService';

/** Typed identity for the host pivot-data service. */
export const FormulaPivotDataServiceDefinition =
  defineFormulaExternalService<FormulaPivotDataService>('formula.pivotData');
