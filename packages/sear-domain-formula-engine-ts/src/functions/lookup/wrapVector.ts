import {
  FormulaErrorCode,
  FormulaRangeSourceKind,
  createFormulaError,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { flatten, lookupValueError, matrixArg, numberOrDateArg, scalar } from './lookupHelpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
import { MAX_FORMULA_ARRAY_CELLS } from '../shared/FormulaArrayLimit';

/** Applies the common vector length, count, and padding rules for WRAPCOLS and WRAPROWS. */
export function wrapVector(args: FormulaArg[], context: EvalContext, byColumns: boolean): FormulaValue {
  if (args.length < 2 || args.length > 3) return lookupValueError();
  const source = resolveConditionalReference(args[0], context);
  if (isFormulaError(source)) return source;
  if (source?.source.kind === FormulaRangeSourceKind.CurrentSheet &&
    source.startRow === source.endRow && source.startCol === source.endCol &&
    context.iterateRangeCells?.(source.startRow, source.startCol, source.endRow, source.endCol)[Symbol.iterator]().next().value
      ?.source === 'empty') return lookupValueError();
  const matrix = matrixArg(args[0], context);
  if (!Array.isArray(matrix)) return matrix;
  if (matrix.length > 1 && matrix.some((row) => row.length > 1)) return lookupValueError();
  const rawCount = numberOrDateArg(args[1], context);
  if (isFormulaError(rawCount)) return rawCount;
  const count = Math.trunc(rawCount);
  if (count < 1) return createFormulaError(FormulaErrorCode.Number);

  const values = flatten(matrix);
  if (values.length === 0) return lookupValueError();
  if (count * Math.ceil(values.length / count) > MAX_FORMULA_ARRAY_CELLS)
    return createFormulaError(FormulaErrorCode.Number);
  const span = Math.min(count, values.length);
  const groups = Math.ceil(values.length / span);
  const fill = args[2] && args[2].kind !== 'missing'
    ? scalar(args[2], context)
    : createFormulaError(FormulaErrorCode.NotAvailable);
  return byColumns
    ? Array.from({ length: span }, (_, row) =>
        Array.from({ length: groups }, (_, column) =>
          column * span + row < values.length ? values[column * span + row] : fill))
    : Array.from({ length: groups }, (_, row) =>
        Array.from({ length: span }, (_, column) =>
          row * span + column < values.length ? values[row * span + column] : fill));
}
