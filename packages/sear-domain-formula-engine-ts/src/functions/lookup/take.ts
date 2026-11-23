import {
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  isFormulaError,
  type FormulaArg,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { matrixArg, numberArg, lookupValueError } from './lookupHelpers';
/** TAKE keeps rows and columns. Example: =TAKE(A1:C3,2) keeps the first two rows. */
export const TAKE: FormulaFunction = {
  name: 'TAKE',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 3) return lookupValueError();
    const matrix = matrixArg(args[0], context, true);
    const rows = numberArg(args[1], context);
    const columns = args[2] && args[2].kind !== 'missing' ? numberArg(args[2], context) : undefined;
    if (isFormulaError(rows)) return rows;
    if (isFormulaError(columns)) return columns;
    if (!Array.isArray(matrix)) return matrix;
    const rowCount = Math.trunc(rows);
    const columnCount = columns === undefined ? undefined : Math.trunc(columns);
    if (rowCount === 0) return zeroCountError(args[1]);
    if (columnCount === 0) return zeroCountError(args[2]);
    const height = matrix.length;
    const width = matrix[0]?.length ?? 0;
    const keptRows = Math.min(Math.abs(rowCount), height);
    const rowSlice = rowCount > 0 ? matrix.slice(0, keptRows) : matrix.slice(height - keptRows);
    const keptColumns = columnCount === undefined ? width : Math.min(Math.abs(columnCount), width);
    return rowSlice.map((row) =>
      columnCount === undefined || columnCount > 0 ? row.slice(0, keptColumns) : row.slice(width - keptColumns),
    );
  },
};

function zeroCountError(arg: FormulaArg | undefined) {
  return createFormulaError(
    arg?.kind === 'value' && arg.sourceKind === FormulaNodeKind.Number && arg.value === 0
      ? FormulaErrorCode.Calculation
      : FormulaErrorCode.Value,
  );
}
