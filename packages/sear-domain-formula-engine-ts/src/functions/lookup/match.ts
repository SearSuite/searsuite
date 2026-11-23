import { type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { readFormulaRangeCell, resolveFormulaRange } from '../shared/helpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
import {
  matrixArg,
  numberArg,
  compareValues,
  lookupValueError,
  lookupNAError,
  lookupRefError,
  mapLookupTargets,
  matchesExactLookup,
  matchesLookupWildcard,
  flatten,
} from './lookupHelpers';
/** MATCH returns the position of a lookup value. Example: =MATCH("B",{"A";"B"},0) returns 2. */
export const MATCH: FormulaFunction = {
  name: 'MATCH',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 3) return lookupValueError();
    const range = resolveFormulaRange(args[1]!, context);
    if (range && isFormulaError(range)) return range;
    const matrix = range ? undefined : matrixArg(args[1], context);
    if (!range && !Array.isArray(matrix)) return lookupNAError();
    const rows = Array.isArray(matrix) ? matrix : [];
    if (range ? range.endRow > range.startRow && range.endCol > range.startCol : rows.length > 1 && rows[0]!.length > 1)
      return lookupNAError();
    const modeValue = args[2] && args[2].kind !== 'missing' ? numberArg(args[2], context) : 1;
    if (isFormulaError(modeValue)) {
      const modeReference = resolveConditionalReference(args[2], context);
      return modeReference && !isFormulaError(modeReference) ? lookupRefError() : modeValue;
    }
    if (args[0]?.kind === 'value' && Array.isArray(args[0].value)
      && args[1]?.kind === 'value' && !Array.isArray(args[1].value)
      && !resolveConditionalReference(args[1], context)) return lookupNAError();
    const mode = Math.sign(Math.trunc(modeValue));
    const values = range
      ? Array.from(
          { length: Math.max(range.endRow - range.startRow + 1, range.endCol - range.startCol + 1) },
          (_, index) =>
            readFormulaRangeCell(
              range,
              range.startRow + (range.endRow > range.startRow ? index : 0),
              range.startCol + (range.endCol > range.startCol ? index : 0),
              context,
            ),
        )
      : flatten(rows);
    if (mode === -1 && values.some((value, index) => index > 0 && compareValues(values[index - 1]!, value) < 0))
      return lookupNAError();
    return mapLookupTargets(args[0], context, (target) => {
      let best = -1;
      for (let i = 0; i < values.length; i++) {
        if (isFormulaError(values[i])) continue;
        if (mode === 0) {
          if (matchesLookupWildcard(values[i]!, target) || matchesExactLookup(values[i]!, target)) return i + 1;
          continue;
        }
        const comparison = compareValues(values[i]!, target);
        if (comparison === 0) return i + 1;
        if (mode === 1 && comparison < 0) best = i;
        if (mode === -1 && comparison > 0) best = i;
        if (mode === -1 && comparison < 0) break;
        if (mode === 1 && comparison > 0) break;
      }
      return best >= 0 ? best + 1 : lookupNAError();
    });
  },
};
