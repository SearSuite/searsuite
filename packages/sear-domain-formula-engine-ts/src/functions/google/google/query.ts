import {
  FormulaFunctionArguments,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaFunction,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { runQuery } from '../runtime/queryRuntime';
import { matrixArg } from '../../lookup/lookupHelpers';
import { forEachFormulaRangeCellWithMetadata, resolveFormulaRange } from '../../shared/helpers';
import { valueError } from '../runtime/googleRuntime';
/** QUERY runs a Google Visualization-style query over tabular data. Example: =QUERY({"A",1;"B",2},"select Col1 where Col2 > 1",0) returns "B". */
export const QUERY: FormulaFunction = {
  name: 'QUERY',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 3) return valueError();
    const data = readQueryData(args[0]!, context);
    if (isFormulaError(data)) return data;
    const reader = new FormulaFunctionArguments(args, context);
    const query = reader.text(1);
    if (isFormulaError(query)) return query;
    const headers = reader.integer(2, 0);
    return isFormulaError(headers) ? headers : headers < -1 ? valueError() : runQuery(data, query, headers);
  },
};

function readQueryData(arg: FormulaArg, context: EvalContext): FormulaValue[][] | FormulaError {
  const range = resolveFormulaRange(arg, context);
  if (isFormulaError(range)) return range;
  if (!range) return matrixArg(arg, context, true);
  const rows: FormulaValue[][] = [];
  const error = forEachFormulaRangeCellWithMetadata(range, context, (cell, row, col) => {
    while (rows.length <= row) rows.push([]);
    rows[row]![col] = cell.source === 'empty' ? null : cell.value;
  });
  return error ?? rows;
}
