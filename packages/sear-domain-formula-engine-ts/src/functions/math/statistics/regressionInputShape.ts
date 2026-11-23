import {
  FormulaErrorCode,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { resolveFormulaRange } from '../../shared/helpers';
import { isRangeArgument } from '../shared/mathUtils';

export type RegressionInputShape = readonly [rows: number, columns: number];

export function regressionInputShape(
  arg: FormulaArg,
  context: EvalContext,
): RegressionInputShape | FormulaError {
  if (isRangeArgument(arg)) {
    const range = resolveFormulaRange(arg, context);
    if (!range || 'kind' in range) return range ?? createFormulaError(FormulaErrorCode.Value);
    return [range.endRow - range.startRow + 1, range.endCol - range.startCol + 1];
  }
  if (arg.kind === 'value' && Array.isArray(arg.value)) {
    const rows = arg.value.length;
    const columns = Array.isArray(arg.value[0]) ? arg.value[0].length : 1;
    return [rows, columns];
  }
  return [1, 1];
}

export function sameRegressionInputShape(left: RegressionInputShape, right: RegressionInputShape): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

export function regressionInputSize(shape: RegressionInputShape): number {
  return shape[0] * shape[1];
}
