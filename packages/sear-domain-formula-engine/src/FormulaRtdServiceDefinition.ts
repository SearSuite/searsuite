import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaRtdService } from './FormulaRtdService';

/** Typed identity for the host RTD service. */
export const FormulaRtdServiceDefinition = defineFormulaExternalService<FormulaRtdService>('formula.rtd');
