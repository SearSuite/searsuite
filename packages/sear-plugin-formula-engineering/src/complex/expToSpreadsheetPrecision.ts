import { SearError } from '@searsuite/sear-foundation-error';

const DIGITS = 60;
const powerOfTen = (places: number): bigint => BigInt(`1${'0'.repeat(places)}`);
const SCALE = powerOfTen(DIGITS);
const REDUCTION = BigInt(2048);

function scaledDecimal(value: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(value.toPrecision(17));
  if (!match) throw new SearError('Expected a finite nonnegative number.');
  const fraction = match[2] ?? '';
  const coefficient = BigInt(match[1]! + fraction);
  const places = DIGITS + Number(match[3] ?? 0) - fraction.length;
  return places >= 0 ? coefficient * powerOfTen(places) : coefficient / powerOfTen(-places);
}

function expScaled(value: bigint): bigint {
  const reduced = value / REDUCTION;
  let term = SCALE;
  let sum = SCALE;
  for (let index = 1; term !== BigInt(0); index++) {
    term = (term * reduced) / (SCALE * BigInt(index));
    sum += term;
  }
  for (let index = 0; index < 11; index++) sum = (sum * sum) / SCALE;
  return sum;
}

function roundRatioToNumber(numerator: bigint, denominator: bigint): number {
  let exponent = numerator.toString().length - denominator.toString().length;
  const power = powerOfTen(Math.abs(exponent));
  if (exponent >= 0 ? numerator < denominator * power : numerator * power < denominator) exponent--;

  const shift = 14 - exponent;
  const scaledNumerator = shift >= 0 ? numerator * powerOfTen(shift) : numerator;
  const scaledDenominator = shift < 0 ? denominator * powerOfTen(-shift) : denominator;
  const quotient = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  const rounded = quotient + (remainder * BigInt(2) >= scaledDenominator ? BigInt(1) : BigInt(0));
  return Number(`${rounded}e${exponent - 14}`);
}

/** Computes the real exponential with the 15-digit half-up rounding used by IMEXP. */
export function expToSpreadsheetPrecision(value: number): number {
  if (!Number.isFinite(value) || value > 709 || value < -745) return Math.exp(value);
  const magnitude = expScaled(scaledDecimal(Math.abs(value)));
  return value < 0 ? roundRatioToNumber(SCALE, magnitude) : roundRatioToNumber(magnitude, SCALE);
}
