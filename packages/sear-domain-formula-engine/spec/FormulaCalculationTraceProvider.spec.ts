import {
  FormulaBatchFlushedEventType,
  FormulaDependenciesChangedEventType,
  FormulaCalculationTraceEventType,
  FormulaErrorChangedEventType,
  FormulaRecalculationCompletedEventType,
  IFormulaCalculationTraceProvider,
} from '../src';

describe('formula trace provider public contract', () => {
  it('exports stable event ids and DI token', () => {
    expect(FormulaCalculationTraceEventType.BatchFlushed).toBe(FormulaBatchFlushedEventType);
    expect(FormulaCalculationTraceEventType.RecalculationCompleted).toBe(FormulaRecalculationCompletedEventType);
    expect(FormulaCalculationTraceEventType.ErrorChanged).toBe(FormulaErrorChangedEventType);
    expect(FormulaCalculationTraceEventType.DependenciesChanged).toBe(FormulaDependenciesChangedEventType);
    expect(IFormulaCalculationTraceProvider.symbol).toBe(Symbol.for('IFormulaCalculationTraceProvider'));
  });
});
