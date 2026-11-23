import { gcd } from './gcd';

export function approximateFraction(value: number, maxDenominator: number): { numerator: number; denominator: number } {
  let bestNumerator = 0;
  let bestDenominator = 1;
  let bestError = Number.POSITIVE_INFINITY;
  for (let denominator = 1; denominator <= maxDenominator; denominator++) {
    const numerator = Math.round(value * denominator);
    const error = Math.abs(value - numerator / denominator);
    if (error < bestError) {
      bestNumerator = numerator;
      bestDenominator = denominator;
      bestError = error;
    }
  }
  const divisor = gcd(bestNumerator, bestDenominator);
  return { numerator: bestNumerator / divisor, denominator: bestDenominator / divisor };
}
