import { FormulaBatchFlushedEventType } from './FormulaBatchFlushedEventType';
import { FormulaDependenciesChangedEventType } from './FormulaDependenciesChangedEventType';
import { FormulaErrorChangedEventType } from './FormulaErrorChangedEventType';
import { FormulaRecalculationCompletedEventType } from './FormulaRecalculationCompletedEventType';

/** Stable formula calculation trace event ids. */
export const FormulaCalculationTraceEventType = {
  BatchFlushed: FormulaBatchFlushedEventType,
  RecalculationCompleted: FormulaRecalculationCompletedEventType,
  ErrorChanged: FormulaErrorChangedEventType,
  DependenciesChanged: FormulaDependenciesChangedEventType,
} as const;
