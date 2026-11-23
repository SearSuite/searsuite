import { type FormulaCalculationTraceEvent } from '@searsuite/sear-domain-formula-engine';
import { defineEventObservation } from '@searsuite/sear-foundation-subscription';

/** Editor-local formula calculation trace events exposed to diagnostic hosts. */
export const FormulaCalculationTraceObservation =
  defineEventObservation<FormulaCalculationTraceEvent>('formula.calculationTrace');
