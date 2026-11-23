import {
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { matrixArg, numberArg, lookupValueError } from './lookupHelpers';
/** DROP removes rows and columns. Example: =DROP(A1:C3,1) removes the first row. */
export const DROP: FormulaFunction = {
  name: 'DROP',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 3) return lookupValueError();
    const matrix = matrixArg(args[0], context, true);
    const rows = numberArg(args[1], context);
    const columns = args[2] && args[2].kind !== 'missing' ? numberArg(args[2], context) : 0;
    if (isFormulaError(rows)) return rows;
    if (isFormulaError(columns)) return columns;
    if (!Array.isArray(matrix) || typeof rows !== 'number' || typeof columns !== 'number')
      return Array.isArray(matrix) ? lookupValueError() : matrix;
    const rowCount = Math.trunc(rows);
    const columnCount = Math.trunc(columns);
    const source = args[0];
    const referenceOrScalarInput =
      source.kind === FormulaNodeKind.Cell ||
      source.kind === FormulaNodeKind.Range ||
      source.kind === FormulaNodeKind.WorkbookCell ||
      source.kind === FormulaNodeKind.WorkbookRange ||
      (source.kind === 'value' && !Array.isArray(source.value));
    if (Math.abs(rows) > matrix.length || Math.abs(columns) > (matrix[0]?.length ?? 0))
      return lookupValueError();
    if (Math.abs(rowCount) >= matrix.length || Math.abs(columnCount) >= (matrix[0]?.length ?? 0))
      return referenceOrScalarInput ? lookupValueError() : createFormulaError(FormulaErrorCode.Calculation);
    const startRow = rowCount >= 0 ? rowCount : 0;
    const endRow = rowCount < 0 ? matrix.length + rowCount : matrix.length;
    const startCol = columnCount >= 0 ? columnCount : 0;
    const endCol = columnCount < 0 ? (matrix[0]?.length ?? 0) + columnCount : matrix[0]?.length ?? 0;
    return matrix.slice(startRow, endRow).map((row) => row.slice(startCol, endCol));
  },
};
