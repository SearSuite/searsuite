import { FormulaErrorCode, createFormulaError, isFormulaArgumentKind, isFormulaError, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, numberArg, lookupValueError } from './lookupHelpers';
import { isBlankScalarInput } from '../shared/blankScalarInput';
import { forEachFormulaRangeCellWithMetadata, formulaRangeHeight, formulaRangeWidth, resolveFormulaRange } from '../shared/helpers';
/** TRIMRANGE removes fully blank outer rows and columns. Example: =TRIMRANGE(A1:D5). */
export const TRIMRANGE: FormulaFunction = {
  name: 'TRIMRANGE',
  evaluate(args, context) {
    if (args.length === 0 || args.length > 3) return lookupValueError();
    const modes: number[] = [];
    for (const arg of args.slice(1)) {
      const mode = isFormulaArgumentKind(arg, 'missing') ? 3 : numberArg(arg, context);
      if (isFormulaError(mode)) return mode;
      if (!Number.isInteger(mode) || mode < 0 || mode > 3) return lookupValueError();
      modes.push(mode);
    }
    const rowMode = modes[0] ?? 3;
    const columnMode = modes[1] ?? 3;
    const range = resolveFormulaRange(args[0]!, context);
    if (range && isFormulaError(range)) return range;
    if (isBlankScalarInput(args[0]!, context)) return createFormulaError(FormulaErrorCode.Reference);
    if (range) {
      const height = formulaRangeHeight(range);
      const width = formulaRangeWidth(range);
      if (height > 1 || width > 1) return lookupValueError();
      const cells: FormulaValue[][] = Array.from({ length: height }, () => Array<FormulaValue>(width).fill(null));
      let firstRow = height;
      let lastRow = -1;
      let firstColumn = width;
      let lastColumn = -1;
      const error = forEachFormulaRangeCellWithMetadata(range, context, (cell, row, col) => {
        const blank = cell.source === 'empty' || cell.value === null || cell.value === '';
        cells[row]![col] = blank ? null : cell.value;
        if (!blank) {
          firstRow = Math.min(firstRow, row);
          lastRow = Math.max(lastRow, row);
          firstColumn = Math.min(firstColumn, col);
          lastColumn = Math.max(lastColumn, col);
        }
      });
      if (error) return error;
      if (lastRow < firstRow && (rowMode !== 0 || columnMode !== 0))
        return createFormulaError(FormulaErrorCode.Reference);
      const top = rowMode & 1 ? firstRow : 0;
      const bottom = rowMode & 2 ? lastRow : height - 1;
      const left = columnMode & 1 ? firstColumn : 0;
      const right = columnMode & 2 ? lastColumn : width - 1;
      return cells.slice(top, bottom + 1).map((row) => row.slice(left, right + 1).map((value) => value === null ? '' : value));
    }
    const matrix = matrixArg(args[0], context);
    return Array.isArray(matrix) ? matrix.map((row) => row.map((value) => value === null ? '' : value)) : matrix;
  },
};
