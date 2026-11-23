import { type FormulaFunction, FormulaErrorCode, createFormulaError, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { lookupValueError } from './lookupHelpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
import { excelGridLimits } from './excelGridLimits';

/** COLUMN returns column numbers for a reference. Example: =COLUMN(C5) returns 3. */
export const COLUMN: FormulaFunction = {
  name: 'COLUMN',
  lazy: true,
  allowReferencesOutsideHostShape: true,
  evaluate(args, context) {
    if (args.length > 1) return lookupValueError();
    if (!args[0]) return context.currentCell ? context.currentCell.col + 1 : createFormulaError(FormulaErrorCode.Value);
    const range = resolveConditionalReference(args[0], context);
    if (!range) return lookupValueError();
    if (isFormulaError(range)) return range;
    if (range.startRow < 0 || range.endRow >= excelGridLimits.rows ||
      range.startCol < 0 || range.endCol >= excelGridLimits.columns) {
      return createFormulaError(FormulaErrorCode.Reference);
    }
    return range.startCol === range.endCol
      ? range.startCol + 1
      : [Array.from({ length: range.endCol - range.startCol + 1 }, (_, index) => range.startCol + index + 1)];
  },
};
