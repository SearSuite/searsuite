import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import {
  matrixArg,
  numberArg,
  compareValues,
  matchesLookupWildcard,
  matchesExactLookup,
  mapLookupTargets,
  lookupNAError,
  lookupValueError,
} from './lookupHelpers';
/** XMATCH returns a position with modern MATCH modes. Example: =XMATCH("B",{"A";"B"}). */
export const XMATCH: FormulaFunction = {
  name: 'XMATCH',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 4) return lookupValueError();
    const rawMatchMode = args[2] && args[2].kind !== 'missing' ? numberArg(args[2], context) : 0;
    if (isFormulaError(rawMatchMode)) return rawMatchMode;
    const matchMode = Math.floor(rawMatchMode);
    if (![-1, 0, 1, 2].includes(matchMode)) return lookupValueError();
    const rawSearchMode = args[3] && args[3].kind !== 'missing' ? numberArg(args[3], context) : 1;
    if (isFormulaError(rawSearchMode)) return rawSearchMode;
    const searchMode = Math.floor(rawSearchMode);
    if (![-2, -1, 1, 2].includes(searchMode)) return lookupValueError();
    const matrix = matrixArg(args[1], context);
    if (isFormulaError(matrix)) return lookupNAError();
    if (matrix.length > 1 && matrix.some((row) => row.length !== 1)) return lookupValueError();
    const values = matrix.flat();
    return mapLookupTargets(args[0], context, (target) => {
      if ((searchMode === 2 || searchMode === -2) && matchMode === 0) {
        let low = 0;
        let high = values.length - 1;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          const candidate = values[middle]!;
          const comparison = compareValues(candidate, target);
          if (!isFormulaError(candidate) && matchesExactLookup(candidate, target)) return middle + 1;
          if (searchMode === 2 ? comparison < 0 : comparison > 0) low = middle + 1;
          else high = middle - 1;
        }
        return lookupNAError();
      }
      let best = -1;
      for (let offset = 0; offset < values.length; offset++) {
        const index = searchMode < 0 ? values.length - 1 - offset : offset;
        const candidate = values[index]!;
        if (isFormulaError(candidate)) continue;
        if (matchMode === 2) {
          if (matchesExactLookup(candidate, target) || matchesLookupWildcard(candidate, target)) return index + 1;
          continue;
        }
        if (matchMode === 0) {
          if (matchesExactLookup(candidate, target)) return index + 1;
          continue;
        }
        const comparison = compareValues(candidate, target);
        if (comparison === 0) return index + 1;
        if (matchMode === -1 && comparison < 0 && (best < 0 || compareValues(candidate, values[best]!) > 0))
          best = index;
        if (matchMode === 1 && comparison > 0 && (best < 0 || compareValues(candidate, values[best]!) < 0))
          best = index;
      }
      return best < 0 ? lookupNAError() : best + 1;
    });
  },
};
