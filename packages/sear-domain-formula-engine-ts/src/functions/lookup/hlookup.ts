import { FormulaNodeKind, type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { readFormulaRangeCell, resolveFormulaRange } from '../shared/helpers';
import {
  booleanArg,
  matrixArg,
  scalar,
  numberArg,
  compareValues,
  lookupValueError,
  lookupNAError,
  lookupRefError,
  sameLookupType,
  matchesLookupWildcard,
  matchesExactLookup,
} from './lookupHelpers';
/** HLOOKUP searches a table's first row. Example: =HLOOKUP("B",A1:C2,2,FALSE). */
export const HLOOKUP: FormulaFunction = {
  name: 'HLOOKUP',
  evaluate(args, context) {
    if (args.length < 3 || args.length > 4) return lookupValueError();
    if (args[0]?.kind === 'value' && Array.isArray(args[0].value)) return lookupNAError();
    const target = scalar(args[0], context);
    if (isFormulaError(target)) return target;
    const range = resolveFormulaRange(args[1]!, context);
    if (range && isFormulaError(range)) return range;
    const table = range ? undefined : matrixArg(args[1], context);
    if (!range && !Array.isArray(table)) return lookupNAError();
    const rows = Array.isArray(table) ? table : [];
    if (!range && args[1]?.kind === 'value' && args[1].sourceKind === FormulaNodeKind.String &&
      typeof args[1].value === 'string' && Number.isNaN(Number(args[1].value))) return lookupValueError();
    const approx = booleanArg(args[3], context, true);
    if (isFormulaError(approx)) return approx;
    let column = -1;
    const width = range ? range.endCol - range.startCol + 1 : rows[0]?.length ?? 0;
    for (let c = 0; c < width; c++) {
      const candidate = range
        ? readFormulaRangeCell(range, range.startRow, range.startCol + c, context)
        : rows[0]![c]!;
      if (isFormulaError(candidate) || !sameLookupType(candidate, target)) continue;
      if (!approx) {
        if (matchesLookupWildcard(candidate, target) || matchesExactLookup(candidate, target)) {
          column = c;
          break;
        }
        continue;
      }
      const cmp = compareValues(candidate, target, approx ? context.textLocale?.compareText : undefined);
      if (cmp === 0) {
        column = c;
        break;
      }
      if (approx && cmp < 0) column = c;
      if (approx && cmp > 0) break;
    }
    if (column < 0) return lookupNAError();
    const row = numberArg(args[2], context);
    if (isFormulaError(row)) {
      return args[2]?.kind === 'value' && args[2].sourceKind === FormulaNodeKind.String
        ? lookupValueError()
        : lookupRefError();
    }
    const rowIndex = Math.trunc(row);
    if (rowIndex < 1) return lookupValueError();
    if (rowIndex > (range ? range.endRow - range.startRow + 1 : rows.length)) return lookupRefError();
    return range
      ? readFormulaRangeCell(range, range.startRow + rowIndex - 1, range.startCol + column, context)
      : rows[rowIndex - 1]?.[column] ?? lookupRefError();
  },
};
