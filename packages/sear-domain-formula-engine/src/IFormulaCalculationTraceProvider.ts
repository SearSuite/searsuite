import { type FormulaCalculationTraceListener } from './FormulaCalculationTraceListener';

/**
 * Read-only subscription provider for formula calculation trace events.
 *
 * Hosts should subscribe through the command surface, while plugins can inject
 * this provider directly during the editor lifecycle. Events are local runtime
 * trace and do not participate in OT or persistence.
 */
export interface IFormulaCalculationTraceProvider {
  /**
   * Subscribes to formula calculation trace events for one editor instance.
   * @param listener - Callback invoked for future calculation trace events.
   * @returns Function that removes the listener; calling it more than once is safe.
   */
  subscribeFormulaCalculationTrace(listener: FormulaCalculationTraceListener): () => void;
}

export namespace IFormulaCalculationTraceProvider {
  /** DI token for resolving IFormulaCalculationTraceProvider. */
  export const symbol = Symbol.for('IFormulaCalculationTraceProvider');
}
