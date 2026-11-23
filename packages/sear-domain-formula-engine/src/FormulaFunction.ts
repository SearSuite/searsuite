import { type CellChange } from './CellChange';
import { type EvalContext } from './EvalContext';
import { type FormulaArg } from './FormulaArg';
import { type FormulaAST } from './FormulaAST';
import { type FormulaFunctionDescriptor } from './FormulaFunctionDescriptor';
import { type FormulaValue } from './FormulaValue';
import { type CellFormat } from '@searsuite/sear-domain-cell-types';

/** Runtime contract implemented by built-in and third-party formula functions. */
export interface FormulaFunction {
  name: string;
  descriptor?: FormulaFunctionDescriptor;
  /** Default display format when this function is the formula's outermost call. */
  defaultCellFormat?: CellFormat;
  volatile?: boolean;
  /** Re-evaluate when the first visible cell changes. */
  volatileOnViewport?: boolean;
  lazy?: boolean;
  /** Pass reference coordinates to the function even when outside the host's materialized sheet shape. */
  allowReferencesOutsideHostShape?: boolean;
  namedConstants?: Readonly<Record<string, FormulaValue>>;
  evaluate(args: FormulaArg[], context: EvalContext): FormulaValue;
  incrementalUpdate?(
    prevResult: FormulaValue,
    changedCells: CellChange[],
    args: FormulaAST[],
    context: EvalContext,
  ): FormulaValue;
}
