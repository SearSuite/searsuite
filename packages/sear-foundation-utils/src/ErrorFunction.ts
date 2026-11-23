/** Real error functions shared by statistical and engineering formulas. */
const TWO_OVER_SQRT_PI = 2 / Math.sqrt(Math.PI);
const SERIES_LIMIT = 3;
const CONTINUED_FRACTION_DEPTH = 32;

/** Evaluates erf without the error floor of short polynomial approximations. */
export function erf(value: number): number {
  if (Number.isNaN(value)) return NaN;
  if (!Number.isFinite(value)) return Math.sign(value);
  const magnitude = Math.abs(value);
  if (magnitude >= SERIES_LIMIT) return Math.sign(value) * (1 - positiveErfc(magnitude));

  // Positive-term form of the Maclaurin series avoids cancellation at moderate x.
  let term = magnitude;
  let sum = term;
  for (let index = 1; index < 200; index++) {
    term *= (2 * magnitude * magnitude) / (2 * index + 1);
    sum += term;
    if (term <= (sum * Number.EPSILON) / 2) break;
  }
  return Math.sign(value) * TWO_OVER_SQRT_PI * Math.exp(-magnitude * magnitude) * sum;
}

/** Evaluates erfc directly in the positive tail to preserve small probabilities. */
export function erfc(value: number): number {
  if (Number.isNaN(value)) return NaN;
  if (value === Infinity) return 0;
  if (value === -Infinity) return 2;
  return value < 0 ? 2 - positiveErfc(-value) : positiveErfc(value);
}

function positiveErfc(value: number): number {
  if (value < SERIES_LIMIT) return 1 - erf(value);
  if (value > 27.3) return 0;

  // DLMF 7.9.2: backward evaluation of the erfc continued fraction.
  const square = 2 * value * value;
  let denominator = square + 4 * CONTINUED_FRACTION_DEPTH + 1;
  for (let index = CONTINUED_FRACTION_DEPTH; index >= 1; index--) {
    denominator = square + 4 * (index - 1) + 1 - ((2 * index - 1) * (2 * index)) / denominator;
  }
  return (Math.exp(-value * value) * 2 * value) / (Math.sqrt(Math.PI) * denominator);
}
