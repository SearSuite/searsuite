import { type FormulaCalculationTraceEvent } from './FormulaCalculationTraceEvent';

/** Listener invoked synchronously for calculation trace events. */
export type FormulaCalculationTraceListener = (event: FormulaCalculationTraceEvent) => void;
