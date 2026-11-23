import { type FormulaFunction, FormulaErrorCode, createFormulaError, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { lookupValueError } from './lookupHelpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
import { excelGridLimits } from './excelGridLimits';
/** ROW returns row numbers for a reference. Example: =ROW(C5) returns 5. */
export const ROW: FormulaFunction = {
  name: 'ROW',
  lazy: true,
  allowReferencesOutsideHostShape: true,
  evaluate(args, context) {
    if (args.length > 1) return lookupValueError();
    if (!args[0]) return context.currentCell ? context.currentCell.row + 1 : createFormulaError(FormulaErrorCode.Value);
    const range = resolveConditionalReference(args[0], context);
    if (!range) return lookupValueError();
    if (isFormulaError(range)) return range;
    if (range.startRow < 0 || range.endRow >= excelGridLimits.rows ||
      range.startCol < 0 || range.endCol >= excelGridLimits.columns) {
      return createFormulaError(FormulaErrorCode.Reference);
    }
    return range.startRow === range.endRow
      ? range.startRow + 1
      : Array.from({ length: range.endRow - range.startRow + 1 }, (_, index) => [range.startRow + index + 1]);
  },
};
