import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaAddInService } from './FormulaAddInService';

/** Typed identity used to publish a host-specific add-in implementation. */
export const FormulaAddInServiceDefinition = defineFormulaExternalService<FormulaAddInService>('formula.addIn');
