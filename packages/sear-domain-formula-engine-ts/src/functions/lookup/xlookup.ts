import { FormulaRangeSourceKind, type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { resolveFormulaRange } from '../shared/helpers';
import {
  matrixArg,
  scalar,
  numberArg,
  compareValues,
  matchesLookupWildcard,
  matchesExactLookup,
  mapLookupTargets,
  lookupValueError,
  lookupNAError,
} from './lookupHelpers';
/** XLOOKUP searches a vector and returns a corresponding value. Example: =XLOOKUP(2,{1,2},{"A","B"}). */
export const XLOOKUP: FormulaFunction = {
  name: 'XLOOKUP',
  evaluate(args, context) {
    if (args.length < 3 || args.length > 6) return lookupValueError();
    const missingTarget = args[0]?.kind === 'missing';
    const lookup = matrixArg(args[1], context, true);
    const result = matrixArg(args[2], context, true);
    if (!Array.isArray(lookup)) return lookup;
    if (!Array.isArray(result)) return result;
    const horizontal = lookup.length === 1;
    if (!horizontal && lookup.some((row) => row.length !== 1)) return lookupValueError();
    const lv = lookup.flat();
    const lookupRange = missingTarget && args[1] ? resolveFormulaRange(args[1], context) : undefined;
    if (lv.length > 1 && (horizontal ? result[0]?.length !== lv.length : result.length !== lv.length)) {
      return lookupValueError();
    }
    const notFound = args[3] && args[3].kind !== 'missing' ? scalar(args[3], context) : lookupNAError();
    const mode = args[4] && args[4].kind !== 'missing' ? numberArg(args[4], context) : 0;
    if (isFormulaError(mode)) return mode;
    if (![-1, 0, 1, 2].includes(mode)) return lookupValueError();
    const search = args[5] && args[5].kind !== 'missing' ? numberArg(args[5], context) : 1;
    if (isFormulaError(search)) return search;
    if (![-2, -1, 1, 2].includes(search)) return lookupValueError();
    const find = (target: ReturnType<typeof scalar>) => {
      let index = -1;
      for (let offset = 0; offset < lv.length; offset++) {
        const candidateIndex = search < 0 ? lv.length - 1 - offset : offset;
        const candidate = lv[candidateIndex]!;
        if (isFormulaError(candidate)) continue;
        if (missingTarget) {
          const source =
            lookupRange && !isFormulaError(lookupRange)
              ? context.metadata?.readCell({
                  row: lookupRange.startRow + (horizontal ? 0 : candidateIndex),
                  col: lookupRange.startCol + (horizontal ? candidateIndex : 0),
                  ...(lookupRange.source.kind === FormulaRangeSourceKind.WorkbookSheet
                    ? { sheetName: lookupRange.source.sheetName }
                    : {}),
                })?.source
              : undefined;
          if (candidate === null || source === 'empty') {
            index = candidateIndex;
            break;
          }
          continue;
        }
        if (mode === 2) {
          if (matchesLookupWildcard(candidate, target)) {
            index = candidateIndex;
            break;
          }
          continue;
        }
        if (mode === 0) {
          if (matchesExactLookup(candidate, target)) { index = candidateIndex; break; }
          continue;
        }
        const comparison = compareValues(candidate, target);
        if (comparison === 0) {
          index = candidateIndex;
          break;
        }
        if (mode === -1 && comparison < 0 && (index < 0 || compareValues(candidate, lv[index]!) > 0))
          index = candidateIndex;
        if (mode === 1 && comparison > 0 && (index < 0 || compareValues(candidate, lv[index]!) < 0))
          index = candidateIndex;
      }
      if (index < 0) return notFound;
      if (horizontal) {
        if (result[0]?.length !== lv.length) return lookupValueError();
        return result.length === 1 ? result[0]![index] : result.map((row) => [row[index]]);
      }
      if (result.length !== lv.length) return lookupValueError();
      return result[index]?.length === 1 ? result[index]![0] : [result[index]!];
    };
    return missingTarget ? find(null) : mapLookupTargets(args[0], context, find);
  },
};
