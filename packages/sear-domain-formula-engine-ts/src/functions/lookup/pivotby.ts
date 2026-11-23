import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, lookupValueError, compareValues } from './lookupHelpers';
import { groupAggregation } from './groupAggregation';
/** PIVOTBY creates a two-key summary with the supplied aggregation. Example: =PIVOTBY(A2:A5,B2:B5,C2:C5,SUM). */
export const PIVOTBY: FormulaFunction = {
  name: 'PIVOTBY',
  evaluate(args, context) {
    if (args.length !== 4) return lookupValueError();
    const aggregate = groupAggregation(args[3], context);
    if (!aggregate) return lookupValueError();
    const rows = matrixArg(args[0], context);
    const columns = matrixArg(args[1], context);
    const values = matrixArg(args[2], context);
    if (!Array.isArray(rows) || !Array.isArray(columns) || !Array.isArray(values)) return lookupValueError();
    if (rows.length !== columns.length || rows.length !== values.length ||
      rows.flat().length !== columns.flat().length || rows.flat().length !== values.flat().length) return lookupValueError();
    const rowKeys: FormulaValue[] = [];
    const colKeys: FormulaValue[] = [];
    const rowValues = rows.flat();
    const columnValues = columns.flat();
    const valueValues = values.flat();
    rowValues.forEach((value) => {
      if (!rowKeys.some((key) => compareValues(key, value) === 0)) rowKeys.push(value);
    });
    columnValues.forEach((value) => {
      if (!colKeys.some((key) => compareValues(key, value) === 0)) colKeys.push(value);
    });
    return [
      ['', ...colKeys],
      ...rowKeys.map((rowKey) => [
        rowKey,
        ...colKeys.map((colKey) => aggregate(valueValues.filter((_, index) =>
          compareValues(rowValues[index]!, rowKey) === 0 && compareValues(columnValues[index]!, colKey) === 0))),
      ]),
    ];
  },
};
