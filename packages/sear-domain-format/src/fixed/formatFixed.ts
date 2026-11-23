import { formatRoundedNumber } from './formatRoundedNumber';

export function formatFixed(number: number, decimals: number, noCommas: boolean): string {
  return formatRoundedNumber(number, decimals, !noCommas);
}
