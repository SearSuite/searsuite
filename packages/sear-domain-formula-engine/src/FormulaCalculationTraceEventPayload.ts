import { type FormulaCalculationTraceEvent } from './FormulaCalculationTraceEvent';

/** Trace event payload before the provider assigns its sequence number. */
export type FormulaCalculationTraceEventPayload = FormulaCalculationTraceEvent extends infer Event
  ? Event extends FormulaCalculationTraceEvent
    ? Omit<Event, 'sequence'>
    : never
  : never;
