import {
  type FormulaFunction,
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { numberOrDateArg, scalar, cellAddress, lookupValueError } from './lookupHelpers';

/** ADDRESS returns an A1 or R1C1 address. Example: =ADDRESS(2,3) returns $C$2. */
export const ADDRESS: FormulaFunction = {
  name: 'ADDRESS',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 5) return lookupValueError();
    const rowValue = numberOrDateArg(args[0], context);
    const columnValue = numberOrDateArg(args[1], context);
    if (isFormulaError(rowValue)) return rowValue;
    if (isFormulaError(columnValue)) return columnValue;
    const row = Math.trunc(rowValue);
    const column = Math.trunc(columnValue);
    if (row < 1 || row > 1_048_576 || column < 1 || column > 16_384)
      return createFormulaError(FormulaErrorCode.Value);
    const absValue = args[2] && args[2].kind !== 'missing' ? numberOrDateArg(args[2], context) : 1;
    if (isFormulaError(absValue)) return absValue;
    const abs = Math.trunc(absValue);
    if (abs < 1 || abs > 4) return lookupValueError();
    const a1 = args[3] && args[3].kind !== 'missing' ? scalar(args[3], context) : true;
    if (isFormulaError(a1)) return a1;
    if (typeof a1 !== 'boolean' && typeof a1 !== 'number') return lookupValueError();
    const sheetValue = args[4] && args[4].kind !== 'missing' ? scalar(args[4], context) : undefined;
    if (isFormulaError(sheetValue)) return sheetValue;
    const sheet = isFormulaText(sheetValue) ? sheetValue.value : sheetValue;
    if (sheet !== undefined && typeof sheet !== 'string') return lookupValueError();
    const absoluteRow = abs === 1 || abs === 2;
    const absoluteColumn = abs === 1 || abs === 3;
    const prefix = sheet === undefined ? '' : /^(?:\[[A-Za-z0-9_.-]+\])?[A-Za-z_][A-Za-z0-9_]*$/.test(sheet)
      ? `${sheet}!`
      : `'${sheet.replaceAll("'", "''")}'!`;
    if (a1 !== false && a1 !== 0) {
      const address = cellAddress(row - 1, column - 1, false);
      const match = address.match(/^([A-Z]+)(\d+)$/)!;
      return `${prefix}${absoluteColumn ? '$' : ''}${match[1]}${absoluteRow ? '$' : ''}${match[2]}`;
    }
    return `${prefix}R${absoluteRow ? row : `[${row}]`}C${absoluteColumn ? column : `[${column}]`}`;
  },
};
