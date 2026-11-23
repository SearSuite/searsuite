import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { forEachFormulaRangeCell, readArg, resolveFormulaRange } from '../../shared/helpers';
import { isBlankScalarInput } from '../../shared/blankScalarInput';
import { numericDateText } from '../../shared/formulaNumericDateText';
import { formulaNumberText } from '../../shared/formulaNumberText';

export type FormulaTextMatrix = FormulaValue[][];

export function valueError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Value);
}

export function isFormulaErrorValue(value: unknown): value is FormulaError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'error' &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

export function scalarValueArg(args: FormulaArg[], index: number, context: EvalContext): FormulaValue | FormulaError {
  const arg = args[index];
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing')) return valueError();
  const value = readArg(arg, context);
  return Array.isArray(value) ? valueError() : value;
}

export function optionalNumberArg(
  args: FormulaArg[],
  index: number,
  context: EvalContext,
  fallback: number,
): number | FormulaError {
  const arg = args[index];
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing')) return fallback;
  return numberArg(args, index, context);
}

export function numberArg(args: FormulaArg[], index: number, context: EvalContext): number | FormulaError {
  const value = scalarValueArg(args, index, context);
  if (isFormulaErrorValue(value)) return value;
  if (value === '' || (isFormulaText(value) && value.value === '')) return valueError();
  const number = coerceNumber(value);
  return isFormulaErrorValue(number) ? numericDateText(value, context) ?? number : number;
}

export function integerArg(
  args: FormulaArg[],
  index: number,
  context: EvalContext,
  fallback: number,
): number | FormulaError {
  const value = optionalNumberArg(args, index, context, fallback);
  return isFormulaErrorValue(value) ? value : Math.trunc(value);
}

export function textArg(args: FormulaArg[], index: number, context: EvalContext): string | FormulaError {
  const value = scalarValueArg(args, index, context);
  if (isFormulaErrorValue(value)) return value;
  const arg = args[index];
  if (arg && isBlankScalarInput(arg, context)) return '';
  return coerceText(value);
}

export function optionalTextArg(
  args: FormulaArg[],
  index: number,
  context: EvalContext,
  fallback: string,
): string | FormulaError {
  const arg = args[index];
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing')) return fallback;
  return textArg(args, index, context);
}

export function booleanArg(
  args: FormulaArg[],
  index: number,
  context: EvalContext,
  fallback: boolean,
): boolean | FormulaError {
  const arg = args[index];
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing')) return fallback;
  const value = scalarValueArg(args, index, context);
  if (isFormulaErrorValue(value)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = isFormulaText(value) ? value.value : typeof value === 'string' ? value : '';
  if (/^true$/i.test(text)) return true;
  if (/^false$/i.test(text)) return false;
  return valueError();
}

export function coerceNumber(value: FormulaValue): number | FormulaError {
  if (isFormulaErrorValue(value)) return value;
  const numeric = toNumberOrError(value);
  return isFormulaErrorValue(numeric) ? valueError() : numeric;
}

export function coerceText(value: FormulaValue): string | FormulaError {
  if (isFormulaErrorValue(value)) return value;
  if (Array.isArray(value)) return valueError();
  if (isFormulaText(value)) return value.value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return formulaNumberText(value);
  if (typeof value === 'string') return value;
  return valueError();
}

export function conciseFormulaText(value: FormulaValue): string {
  if (isFormulaErrorValue(value)) return value.code;
  if (Array.isArray(value)) return value.map(conciseFormulaText).join(', ');
  if (isFormulaText(value)) return value.value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

export function strictFormulaText(value: FormulaValue): string {
  if (isFormulaErrorValue(value)) return value.code;
  if (Array.isArray(value)) return arrayConstantText(value.map((item) => (Array.isArray(item) ? item : [item])));
  if (isFormulaText(value)) return quoteFormulaText(value.value);
  if (typeof value === 'string') return quoteFormulaText(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return formulaNumberText(value);
  return String(value);
}

export function quoteFormulaText(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function arrayConstantText(rows: FormulaValue[][]): string {
  return `{${rows.map((row) => row.map(strictFormulaText).join(',')).join(';')}}`;
}

export function matrixArg(args: FormulaArg[], index: number, context: EvalContext): FormulaTextMatrix | FormulaError {
  const arg = args[index];
  if (arg === undefined || isFormulaArgumentKind(arg, 'missing')) return valueError();

  if (
    isFormulaArgumentKind(arg, FormulaNodeKind.Range) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.ColumnRange) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.RowRange) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.Cell) ||
    isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell)
  ) {
    const range = resolveFormulaRange(arg, context);
    if (!range || isFormulaErrorValue(range)) return range ?? valueError();

    const rows: FormulaTextMatrix = [];
    const width = range.endCol - range.startCol + 1;
    let row: FormulaValue[] = [];
    const error = forEachFormulaRangeCell(range, context, (value) => {
      row.push(value);
      if (row.length === width) {
        rows.push(row);
        row = [];
      }
    });
    if (error) return error;
    if (row.length > 0) rows.push(row);
    return rows;
  }

  const value = readArg(arg, context);
  if (isFormulaErrorValue(value)) return value;
  if (!Array.isArray(value)) return [[value]];
  const rows = value.map((row) => (Array.isArray(row) ? row.slice() : [row]));
  return rows.length > 0 ? rows : valueError();
}
