import { type FormulaFunction, FormulaErrorCode, createFormulaError, isFormulaError, type FormulaArg, type EvalContext } from '@searsuite/sear-domain-formula-engine';
import { numberArg, lookupValueError, matrixArg, rangeArg, readReferenceMatrix } from './lookupHelpers';

function selectedValue(args: readonly FormulaArg[], context: EvalContext, numericIndex: number) {
  const index = Math.trunc(numericIndex);
  if (index < 1 || index >= args.length) return createFormulaError(FormulaErrorCode.Value);
  const selected = args[index];
  if (!selected) return lookupValueError();
  if (selected.kind === 'value') return selected.value;
  if (selected.kind === 'expression') return context.evaluateFormula?.(selected.ast) ?? lookupValueError();
  const range = rangeArg(selected, context);
  if (isFormulaError(range)) return range;
  return context.readReference?.(range) ?? readReferenceMatrix(range, context);
}

/** CHOOSE selects a value by index. Example: =CHOOSE(2,"A","B") returns B. */
export const CHOOSE: FormulaFunction = {
  name: 'CHOOSE',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 255) return lookupValueError();
    const indexes = matrixArg(args[0], context, true);
    if (isFormulaError(indexes)) return indexes;
    if (indexes.length === 1 && indexes[0]?.length === 1) {
      const numeric = numberArg({ kind: 'value', value: indexes[0][0]! }, context);
      return isFormulaError(numeric) ? numeric : selectedValue(args, context, numeric);
    }
    return indexes.map((row) => row.map((value) => {
      const numeric = numberArg({ kind: 'value', value }, context);
      return isFormulaError(numeric) ? numeric : selectedValue(args, context, numeric);
    }));
  },
};
