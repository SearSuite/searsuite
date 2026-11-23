/**
 * AGGREGATE: Applies an aggregate operation while honoring options for hidden rows and errors.
 * Example: =AGGREGATE(4,6,{1,2,3}) returns 3.
 */
import { FormulaNodeKind, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, readScalar, valueError } from '../shared/mathUtils';
import { collectAggregateItems, applyAggregate } from './aggregateUtils';

export const AGGREGATE: FormulaFunction = {
  name: 'AGGREGATE',
  evaluate(args, context): FormulaValue {
    if (args.length < 3) return valueError();
    const functionNumberValue = readScalar(args, 0, context);
    if (isFormulaErrorValue(functionNumberValue)) return functionNumberValue;
    const functionNumber = Math.trunc(functionNumberValue);
    const optionsValue = readScalar(args, 1, context);
    if (isFormulaErrorValue(optionsValue)) return optionsValue;
    const options = optionsValue < 0 ? -Math.round(-optionsValue) : Math.trunc(optionsValue);
    if (options < 0 || options >= 8) return valueError();

    const refs = args.slice(2);
    const kRequired = [14, 15, 16, 17, 18, 19].includes(functionNumber);
    let k: number | undefined;
    if (kRequired) {
      if (refs.length !== 2) return valueError();
      const kArg = refs.pop()!;
      const kValue = readScalar([kArg], 0, context);
      if (isFormulaErrorValue(kValue)) return kValue;
      k = [14, 15, 17, 19].includes(functionNumber) ? Math.trunc(kValue) : kValue;
    }
    if (refs.some((arg) => arg.kind === 'value' && !Array.isArray(arg.value) &&
      arg.sourceKind !== FormulaNodeKind.Call))
      return valueError();

    const items = collectAggregateItems(refs, context, {
      ignoreHidden: options === 1 || options === 3 || options === 5 || options === 7,
      ignoreErrors: options === 2 || options === 3 || options === 6 || options === 7,
      ignoreNested: options <= 3,
      countErrors: functionNumber === 2 || functionNumber === 3,
    });
    if (isFormulaErrorValue(items)) return items;
    return applyAggregate(functionNumber, items, k);
  },
};
