import { isFormulaError, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, numberArg, booleanArg, compareSortValues, lookupValueError, transpose } from './lookupHelpers';

function sortCategory(value: FormulaValue): number {
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return 1;
  if (value === null || value === '' || typeof value === 'object' && 'value' in value && value.value === '')
    return 3;
  return 2;
}

/** SORT orders rows by one column. Example: =SORT(A1:B3,1,1). */
export const SORT: FormulaFunction = {
  name: 'SORT',
  evaluate(args, context) {
    if (args.length < 1 || args.length > 4) return lookupValueError();
    const matrix = matrixArg(args[0], context, true);
    if (!Array.isArray(matrix)) return matrix;
    const index = args[1] && args[1].kind !== 'missing' ? numberArg(args[1], context) : 1;
    const order = args[2] && args[2].kind !== 'missing' ? numberArg(args[2], context) : 1;
    if (isFormulaError(index)) return index;
    if (isFormulaError(order)) return order;
    const byColumn = booleanArg(args[3], context);
    if (isFormulaError(byColumn)) return byColumn;
    const sortable = byColumn ? transpose(matrix) : matrix;
    const column = Math.trunc(index);
    if (column < 1 || column > sortable[0]!.length || ![1, -1].includes(order))
      return lookupValueError();
    const sorted = [...sortable].sort((a, b) => {
      const left = a[column - 1]!;
      const right = b[column - 1]!;
      const categoryDifference = sortCategory(left) - sortCategory(right);
      return (categoryDifference || compareSortValues(left, right)) * order;
    });
    return byColumn ? transpose(sorted) : sorted;
  },
};
