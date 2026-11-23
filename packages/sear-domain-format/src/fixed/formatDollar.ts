import { formatCurrency } from './formatCurrency';

export function formatDollar(number: number, decimals: number, currencySymbol = '$'): string {
  return formatCurrency(number, currencySymbol, decimals, true);
}
