import {
  createFormulaError,
  FormulaErrorCode,
  isFormulaArgumentKind,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaFunction,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import {
  booleanArg,
  coerceText,
  integerArg,
  isFormulaErrorValue,
  matrixArg,
  scalarValueArg,
  textArg,
  valueError,
} from './textFormat/FormulaTextValues';
import { findCaseInsensitive } from './textCaseFold';

function delimitersArg(args: FormulaArg[], index: number, context: EvalContext): string[] | FormulaError {
  const arg = args[index];
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing')) return [];
  const matrix = matrixArg(args, index, context);
  if (isFormulaErrorValue(matrix)) return matrix;
  const delimiters: string[] = [];
  for (const row of matrix) for (const value of row) {
    const delimiter = coerceText(value);
    if (isFormulaErrorValue(delimiter)) return delimiter;
    if (delimiter) delimiters.push(delimiter);
  }
  return delimiters;
}

function split(value: string, delimiters: readonly string[], caseInsensitive: boolean): string[] {
  if (!delimiters.length) return [value];
  const result: string[] = [];
  let start = 0;
  while (start <= value.length) {
    let next: { start: number; end: number } | null = null;
    for (const delimiter of delimiters) {
      const position = caseInsensitive ? -1 : value.indexOf(delimiter, start);
      const found = caseInsensitive
        ? findCaseInsensitive(value, delimiter, start)
        : position < 0 ? null : { start: position, end: position + delimiter.length };
      if (found && (!next || found.start < next.start || (found.start === next.start && found.end > next.end)))
        next = found;
    }
    if (!next) break;
    result.push(value.slice(start, next.start));
    start = next.end;
  }
  result.push(value.slice(start));
  return result;
}

/** Splits text into a spill matrix. Example: TEXTSPLIT("A,B",",") returns {"A","B"}. */
export const TEXTSPLIT: FormulaFunction = {
  name: 'TEXTSPLIT',
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const colDelimiters = delimitersArg(args, 1, context);
    if (isFormulaErrorValue(colDelimiters)) return colDelimiters;
    const rowDelimiters = delimitersArg(args, 2, context);
    if (isFormulaErrorValue(rowDelimiters)) return rowDelimiters;
    const ignoreEmpty = booleanArg(args, 3, context, false);
    if (isFormulaErrorValue(ignoreEmpty)) return ignoreEmpty;
    const matchMode = integerArg(args, 4, context, 0);
    if (isFormulaErrorValue(matchMode)) return matchMode;
    if (matchMode !== 0 && matchMode !== 1) return valueError();
    const padArg = args[5];
    const pad: FormulaValue = padArg === undefined || isFormulaArgumentKind(padArg, 'missing')
      ? createFormulaError(FormulaErrorCode.NotAvailable)
      : scalarValueArg(args, 5, context);
    if (!text) return valueError();
    if (!colDelimiters.length && !rowDelimiters.length) return valueError();
    let rows = split(text, rowDelimiters, matchMode === 1);
    if (ignoreEmpty) rows = rows.filter(Boolean);
    const matrix = rows.map((row) => {
      let columns = split(row, colDelimiters, matchMode === 1);
      if (ignoreEmpty) columns = columns.filter(Boolean);
      return columns;
    });
    const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    if (width === 0) return createFormulaError(FormulaErrorCode.Calculation);
    return matrix.map((row) => [...row, ...Array<FormulaValue>(Math.max(0, width - row.length)).fill(pad)]);
  },
};
