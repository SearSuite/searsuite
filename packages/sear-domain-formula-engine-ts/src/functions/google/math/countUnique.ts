import { isFormulaError, type FormulaError, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { matrixArg } from '../../lookup/lookupHelpers';
import { forEachFormulaRangeCellWithMetadata, resolveFormulaRange } from '../../shared/helpers';
import { valueError } from '../runtime/googleRuntime';
/** COUNTUNIQUE counts distinct values. Example: =COUNTUNIQUE(1,1,2) returns 2. */
export const COUNTUNIQUE: FormulaFunction = {
  name: 'COUNTUNIQUE',
  evaluate(args, context) {
    if (args.length === 0) return valueError();
    const keys = new Set<string>();
    for (const arg of args) {
      const range = resolveFormulaRange(arg, context);
      if (isFormulaError(range)) return range;
      if (range) {
        let cellError: FormulaError | undefined;
        const rangeError = forEachFormulaRangeCellWithMetadata(range, context, (cell) => {
          if (isFormulaError(cell.value)) {
            cellError = cell.value;
            return false;
          }
          if (cell.source !== 'empty' && !isBlank(cell.value)) keys.add(key(cell.value));
        });
        if (cellError || rangeError) return cellError ?? rangeError!;
        continue;
      }
      const value = matrixArg(arg, context);
      if (isFormulaError(value)) return value;
      value.flat().forEach((item) => {
        if (!isBlank(item)) keys.add(key(item));
      });
    }
    return keys.size;
  },
};
function isBlank(value: FormulaValue): boolean {
  return value === null || value === '' || (isFormulaText(value) && value.value === '');
}
function key(value: FormulaValue): string {
  if (typeof value === 'string' || isFormulaText(value)) {
    return `string:${(typeof value === 'string' ? value : value.value).toLowerCase()}`;
  }
  return typeof value === 'object' ? JSON.stringify(value) : `${typeof value}:${String(value)}`;
}
