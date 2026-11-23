import {
  formatDollar as formatSharedDollar,
  formatExcelText as formatSharedExcelText,
  formatFixed as formatSharedFixed,
  parseNumberValue as parseSharedNumberValue,
} from '@searsuite/sear-domain-format';
import { type FormulaError, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, valueError } from './FormulaTextValues';

export function formatExcelText(value: FormulaValue, formatText: string): string | FormulaError {
  // Reference identities are only meaningful to reference-aware functions;
  // text formatting accepts scalar values and must not materialize them.
  if (Array.isArray(value) || isFormulaReferenceValue(value)) return valueError();
  const result = formatSharedExcelText(value as Parameters<typeof formatSharedExcelText>[0], formatText);
  if (result === null) return valueError();
  if (isFormulaErrorValue(result)) return result as FormulaError;
  return result as string;
}

function isFormulaReferenceValue(value: FormulaValue): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'reference';
}

export function formatDollar(number: number, decimals: number, currencySymbol?: string): string {
  return formatSharedDollar(number, decimals, currencySymbol);
}

export function formatFixed(number: number, decimals: number, noCommas: boolean): string {
  return formatSharedFixed(number, decimals, noCommas);
}

export function parseNumberValue(source: string, decimalSeparator = '.', groupSeparator = ','): number | FormulaError {
  return parseSharedNumberValue(source, decimalSeparator, groupSeparator) ?? valueError();
}
