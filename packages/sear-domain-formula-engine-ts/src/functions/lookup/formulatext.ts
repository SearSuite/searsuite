import { type FormulaFunction, FormulaErrorCode, createFormulaError, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { lookupValueError } from './lookupHelpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
/** FORMULATEXT returns source text for a formula cell. Example: =FORMULATEXT(A1). */
export const FORMULATEXT: FormulaFunction = {
  name: 'FORMULATEXT',
  lazy: true,
  evaluate(args, context) {
    if (args.length !== 1) return lookupValueError();
    const range = resolveConditionalReference(args[0], context);
    if (isFormulaError(range)) return range;
    if (!range) return createFormulaError(FormulaErrorCode.Value);
    return (
      context.formulaSource?.getFormulaSource(range.startRow, range.startCol) ??
      createFormulaError(FormulaErrorCode.NotAvailable)
    );
  },
};
