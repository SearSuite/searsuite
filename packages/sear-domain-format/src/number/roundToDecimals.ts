export function roundToDecimals(value: number, decimals: number): number {
  if (decimals >= 0) {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
  }
  const factor = Math.pow(10, -decimals);
  if (!Number.isFinite(factor)) return 0;
  return Math.round(value / factor) * factor;
}
