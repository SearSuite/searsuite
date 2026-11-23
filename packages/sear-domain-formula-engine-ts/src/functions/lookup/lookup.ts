import { FormulaNodeKind, type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { resolveFormulaRange } from '../shared/helpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
import { matrixArg, scalar, compareValues, lookupValueError, lookupNAError } from './lookupHelpers';
/** LOOKUP performs approximate vector lookup. Example: =LOOKUP(2,{1,2,3},{"A","B","C"}) returns B. */
export const LOOKUP: FormulaFunction = {
  name: 'LOOKUP',
  evaluate(args, context) {
    if (args.length !== 2 && args.length !== 3) return lookupValueError();
    if (args[0]?.kind === 'value' && Array.isArray(args[0].value)) return lookupNAError();
    const target = scalar(args[0], context);
    if (isFormulaError(target)) return target;
    if (args[1]?.kind === 'value' &&
      (args[1].sourceKind === FormulaNodeKind.String || args[1].sourceKind === FormulaNodeKind.Boolean) &&
      args[1].sourceAst?.kind !== FormulaNodeKind.Call)
      return lookupValueError();
    const lookup = matrixArg(args[1], context, true);
    if (!Array.isArray(lookup)) return lookup;
    if (args[2]?.kind === 'value' && !Array.isArray(args[2].value) && !isFormulaError(args[2].value)
      && !resolveConditionalReference(args[2], context))
      return args[2].sourceKind === FormulaNodeKind.String || args[2].sourceKind === FormulaNodeKind.Boolean
        ? lookupValueError() : lookupNAError();
    const result = args[2] ? matrixArg(args[2], context, true) : lookup;
    if (!Array.isArray(result)) return result;
    if (args[2] && result.length > 1 && result.some((row) => row.length > 1)) return lookupNAError();
    const lookupByColumn = lookup.length >= Math.max(...lookup.map((row) => row.length));
    const lv = lookupByColumn ? lookup.map((row) => row[0]) : lookup[0] ?? [];
    const rv = args[2]
      ? result.length > Math.max(...result.map((row) => row.length))
        ? result.map((row) => row[0])
        : result[0] ?? []
      : lookupByColumn
      ? lookup.map((row) => row[row.length - 1])
      : lookup[lookup.length - 1] ?? [];
    let index = -1;
    const lookupRange = resolveFormulaRange(args[1], context);
    if (lookupRange && !('kind' in lookupRange) && typeof target === 'number'
      && lv.every((value) => typeof value === 'number')) {
      let low = 0;
      let high = lv.length - 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const comparison = compareValues(lv[middle]!, target);
        if (comparison <= 0) {
          index = middle;
          low = middle + 1;
        } else high = middle - 1;
      }
    } else {
      for (let i = 0; i < lv.length; i++) {
        if (isFormulaError(lv[i])) continue;
        if (typeof lv[i] !== typeof target) continue;
        if (compareValues(lv[i]!, target) <= 0) index = i;
        else break;
      }
    }
    if (index < 0) return lookupNAError();
    if (index >= rv.length) {
      const resultRange = args[2] && resolveConditionalReference(args[2], context);
      if (resultRange && !isFormulaError(resultRange)
        && resultRange.startRow === resultRange.endRow && resultRange.startCol === resultRange.endCol)
        return 0;
      return lookupNAError();
    }
    return rv[index];
  },
};
