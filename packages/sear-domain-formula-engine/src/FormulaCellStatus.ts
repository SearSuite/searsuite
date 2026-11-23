import { type CellKey } from './CellKey';
import { type Dependency } from './Dependency';
import { type ErrorCode } from './ErrorCode';
import { type FormulaValue } from './FormulaValue';

/** Read-only formula status snapshot for one sheet cell. */
export interface FormulaCellStatus {
  readonly row: number;
  readonly col: number;
  readonly isFormulaCell: boolean;
  readonly formula: string | undefined;
  readonly result: FormulaValue | undefined;
  readonly errorCode: ErrorCode | undefined;
  readonly dirty: boolean;
  readonly dependencies: readonly Dependency[];
  readonly dependents: readonly CellKey[];
}
