import { formatRoundedNumber } from './formatRoundedNumber';

export function formatCurrency(value: number, symbol: string, decimals: number, useGrouping: boolean): string {
  const rounded = formatRoundedNumber(Math.abs(value), decimals, useGrouping);
  return value < 0 ? `(${symbol}${rounded})` : `${symbol}${rounded}`;
}
