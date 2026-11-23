import { type FormulaBatchFlushedEvent } from './FormulaBatchFlushedEvent';
import { type FormulaDependenciesChangedEvent } from './FormulaDependenciesChangedEvent';
import { type FormulaErrorChangedEvent } from './FormulaErrorChangedEvent';
import { type FormulaRecalculationCompletedEvent } from './FormulaRecalculationCompletedEvent';

/** Formula calculation trace event union. */
export type FormulaCalculationTraceEvent =
  | FormulaBatchFlushedEvent
  | FormulaRecalculationCompletedEvent
  | FormulaErrorChangedEvent
  | FormulaDependenciesChangedEvent;
