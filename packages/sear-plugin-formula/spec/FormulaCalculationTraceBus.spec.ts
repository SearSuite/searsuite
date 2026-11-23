import {
  FormulaCalculationTraceEventType,
  type FormulaCalculationTraceEvent,
  type FormulaCalculationTraceListener,
} from '@searsuite/sear-domain-formula-engine';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { FormulaCalculationTraceBus } from '../src/FormulaCalculationTraceBus';

describe('FormulaCalculationTraceBus', () => {
  it('notifies subscribers with provider-owned sequence numbers and supports disposal', () => {
    const platform = { warn: jest.fn() } as unknown as Platform;
    const store = new FormulaCalculationTraceBus(platform);
    const listener = jest.fn<void, [FormulaCalculationTraceEvent]>();

    const dispose = store.subscribeFormulaCalculationTrace(listener);
    store.emit({
      type: FormulaCalculationTraceEventType.DependenciesChanged,
      key: 1,
      row: 0,
      col: 1,
      previousDependencies: [],
      dependencies: [],
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: FormulaCalculationTraceEventType.DependenciesChanged,
        sequence: 1,
      }),
    );

    dispose();
    dispose();
    store.emit({
      type: FormulaCalculationTraceEventType.DependenciesChanged,
      key: 2,
      row: 0,
      col: 2,
      previousDependencies: [],
      dependencies: [],
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reports listener failures without interrupting later listeners', () => {
    const platform = { warn: jest.fn() } as unknown as Platform;
    const store = new FormulaCalculationTraceBus(platform);
    const failing: FormulaCalculationTraceListener = () => {
      throw new Error('listener failed');
    };
    const next = jest.fn<void, [FormulaCalculationTraceEvent]>();

    store.subscribeFormulaCalculationTrace(failing);
    store.subscribeFormulaCalculationTrace(next);
    store.emit({
      type: FormulaCalculationTraceEventType.DependenciesChanged,
      key: 1,
      row: 0,
      col: 1,
      previousDependencies: [],
      dependencies: [],
    });

    expect(platform.warn).toHaveBeenCalledWith('[Formula] Calculation trace listener failed.', expect.any(Error));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('publishes only inside the owning command after startup', () => {
    const store = new FormulaCalculationTraceBus({ warn: jest.fn() } as unknown as Platform);
    const listener = jest.fn<void, [FormulaCalculationTraceEvent]>();
    const event = {
      type: FormulaCalculationTraceEventType.DependenciesChanged,
      key: 1,
      row: 0,
      col: 1,
      previousDependencies: [],
      dependencies: [],
    };
    let executing = false;
    store.subscribeFormulaCalculationTrace(listener);
    store.enforceCommandBoundary(() => executing);
    Object.assign(store, { sequence: 100, isCommandExecuting: () => true });

    expect(() => store.emit(event)).toThrow('editor.commands.run');
    expect(listener).not.toHaveBeenCalled();
    executing = true;
    store.emit(event);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sequence: 1 }));
    expect(() => store.enforceCommandBoundary(() => true)).toThrow('already bound');
  });
});
