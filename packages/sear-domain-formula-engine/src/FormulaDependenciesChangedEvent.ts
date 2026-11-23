import { type CellKey } from './CellKey';
import { type Dependency } from './Dependency';
import { type FormulaCalculationTraceEventBase } from './FormulaCalculationTraceEventBase';
import { FormulaDependenciesChangedEventType } from './FormulaDependenciesChangedEventType';

/** Event emitted when one formula cell's dependency edges change. */
export interface FormulaDependenciesChangedEvent extends FormulaCalculationTraceEventBase {
  readonly type: typeof FormulaDependenciesChangedEventType;
  readonly key: CellKey;
  readonly row: number;
  readonly col: number;
  readonly previousDependencies: readonly Dependency[];
  readonly dependencies: readonly Dependency[];
}
