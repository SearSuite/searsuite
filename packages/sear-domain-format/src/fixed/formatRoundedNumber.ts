import { groupInteger } from '../number/groupInteger';
import { roundToDecimals } from '../number/roundToDecimals';

export function formatRoundedNumber(value: number, decimals: number, useGrouping: boolean): string {
  if (Number.isFinite(value) && Math.abs(value) >= 1e21 && decimals <= 100) {
    const precision = Math.max(0, decimals);
    return new Intl.NumberFormat('en-US', {
      useGrouping,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(decimals < 0 ? roundToDecimals(value, decimals) : value);
  }
  const rounded = roundToDecimals(value, decimals);
  const positiveDecimals = Math.max(0, decimals);
  const text = Math.abs(rounded).toFixed(positiveDecimals);
  const [integer, fraction] = text.split('.');
  const grouped = useGrouping ? groupInteger(integer) : integer;
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${grouped}${fraction !== undefined && positiveDecimals > 0 ? `.${fraction}` : ''}`;
}
