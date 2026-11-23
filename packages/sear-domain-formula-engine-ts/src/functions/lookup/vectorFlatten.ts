import { isFormulaError, type EvalContext, type FormulaArg, type FormulaError, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { flatten, lookupValueError, numberArg } from './lookupHelpers';

type IgnoreMode = 0 | 1 | 2 | 3;

export function vectorIgnoreMode(arg: FormulaArg | undefined, context: EvalContext): IgnoreMode | FormulaError {
  if (!arg || arg.kind === 'missing') return 0;
  const value = numberArg(arg, context);
  if (isFormulaError(value)) return value;
  const mode = Math.trunc(value);
  return mode >= 0 && mode <= 3 ? mode as IgnoreMode : lookupValueError();
}

export function flattenVector(matrix: FormulaValue[][], ignore: IgnoreMode, scanByColumn = false): FormulaValue[] {
  const values: FormulaValue[] = scanByColumn ? [] : flatten(matrix);
  if (scanByColumn) {
    const columns = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    for (let col = 0; col < columns; col++)
      for (const row of matrix) if (col < row.length) values.push(row[col]);
  }
  return values.filter((value) => {
    const blank = value === null || value === '' || isFormulaText(value) && value.value === '';
    return !((ignore & 1) && blank || (ignore & 2) && isFormulaError(value));
  });
}
