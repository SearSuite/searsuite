import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, lookupValueError, compareValues } from './lookupHelpers';
import { groupAggregation } from './groupAggregation';
/** GROUPBY groups rows by a key and applies the supplied aggregation. Example: =GROUPBY(A2:A5,B2:B5,SUM). */
export const GROUPBY: FormulaFunction = {
  name: 'GROUPBY',
  evaluate(args, context) {
    if (args.length !== 3) return lookupValueError();
    const aggregate = groupAggregation(args[2], context);
    if (!aggregate) return lookupValueError();
    const keys = matrixArg(args[0], context);
    const values = matrixArg(args[1], context);
    if (!Array.isArray(keys) || !Array.isArray(values)) return Array.isArray(keys) ? lookupValueError() : keys;
    if (keys.length !== values.length || keys.flat().length !== values.flat().length) return lookupValueError();
    const groups: Array<{ key: FormulaValue; values: FormulaValue[] }> = [];
    const valueCells = values.flat();
    keys.flat().forEach((key, index) => {
      let group = groups.find((item) => compareValues(item.key, key) === 0);
      if (!group) {
        group = { key, values: [] };
        groups.push(group);
      }
      group.values.push(valueCells[index]!);
    });
    return groups.map(({ key, values: groupValues }) => [key, aggregate(groupValues)]);
  },
};
