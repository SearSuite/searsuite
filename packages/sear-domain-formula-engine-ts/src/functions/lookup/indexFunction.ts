import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { readFormulaRangeCell, resolveFormulaRange } from '../shared/helpers';
import { matrixArg, numberArg, numberOrDateArg, lookupValueError, lookupRefError } from './lookupHelpers';
import { resolveUnionReferenceAreas } from '../shared/conditionalReference';
/** INDEX returns a value or subarray by row and column. Example: =INDEX(A1:C3,2,3). */
export const INDEX: FormulaFunction = {
  name: 'INDEX',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 4) return lookupValueError();
    const rowValue = numberOrDateArg(args[1], context);
    if (isFormulaError(rowValue)) return rowValue;
    const columnValue = args[2] && args[2].kind !== 'missing' ? numberArg(args[2], context) : 0;
    if (isFormulaError(columnValue)) return columnValue;
    const areaValue = args[3] && args[3].kind !== 'missing' ? numberArg(args[3], context) : 1;
    if (isFormulaError(areaValue)) return areaValue;
    const area = Math.trunc(areaValue);
    if (area < 1) return lookupValueError();
    const areas = resolveUnionReferenceAreas(args[0], context);
    if (areas && !Array.isArray(areas)) return areas;
    if ((areas && area > areas.length) || (!areas && area > 1)) return lookupRefError();
    const range = areas ? areas[area - 1] : resolveFormulaRange(args[0]!, context);
    if (range && isFormulaError(range)) return range;
    if (rowValue < -1e-12 || columnValue < -1e-12) return lookupValueError();
    const row = Math.trunc(rowValue);
    const column = Math.trunc(columnValue);
    if (row < 0 || column < 0) return lookupValueError();
    if (range) {
      const height = range.endRow - range.startRow + 1;
      const width = range.endCol - range.startCol + 1;
      if (row > height || column > width) return lookupRefError();
      if (row > 0 && column > 0)
        return readFormulaRangeCell(range, range.startRow + row - 1, range.startCol + column - 1, context);
      if (row > 0) {
        const values = [];
        for (let col = range.startCol; col <= range.endCol; col++) {
          const value = readFormulaRangeCell(range, range.startRow + row - 1, col, context);
          values.push(value);
        }
        return [values];
      }
      if (column > 0) {
        const values = [];
        for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex++) {
          const value = readFormulaRangeCell(range, rowIndex, range.startCol + column - 1, context);
          values.push([value]);
        }
        return values;
      }
    }
    const matrix = matrixArg(args[0], context);
    if (isFormulaError(matrix)) {
      if ((row > 1 || column > 1) &&
        (matrix.code === '#NULL!' || matrix.code === '#N/A')) return lookupRefError();
      return matrix;
    }
    if (!Array.isArray(matrix)) {
      return row > 1 || column > 1 ? lookupRefError() : matrix;
    }
    if (row === 0 && column === 0) return matrix;
    if (row === 0) return matrix.map((r) => [column <= r.length ? r[column - 1] : lookupRefError()]);
    if (column === 0) return matrix[row - 1] ? [matrix[row - 1]] : lookupRefError();
    const selectedRow = matrix[row - 1];
    return selectedRow && column <= selectedRow.length ? selectedRow[column - 1]! : lookupRefError();
  },
};
