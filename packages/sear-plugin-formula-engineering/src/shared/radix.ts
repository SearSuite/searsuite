import { numberError } from './errors';

type Radix = 2 | 8 | 16;

const widths: Record<Radix, number> = { 2: 10, 8: 10, 16: 10 };
const bits: Record<Radix, number> = { 2: 10, 8: 30, 16: 40 };
const positiveMaximum: Record<Radix, number> = { 2: 511, 8: 536_870_911, 16: 549_755_813_887 };
const negativeMinimum: Record<Radix, number> = { 2: -512, 8: -536_870_912, 16: -549_755_813_888 };

export function parseSignedRadix(input: string, radix: Radix): number | ReturnType<typeof numberError> {
  if (input === '') return 0;
  if (input !== input.trim()) return numberError();
  const normalized = input;
  if (normalized.length > widths[radix]) return numberError();
  const pattern = radix === 2 ? /^[01]+$/ : radix === 8 ? /^[0-7]+$/ : /^[0-9a-f]+$/i;
  if (!pattern.test(normalized)) return numberError();
  const unsigned = BigInt(`0${radix === 2 ? 'b' : radix === 8 ? 'o' : 'x'}${normalized}`);
  const signBit = BigInt(1) << BigInt(bits[radix] - 1);
  const full = BigInt(1) << BigInt(bits[radix]);
  return Number(normalized.length === widths[radix] && (unsigned & signBit) !== BigInt(0) ? unsigned - full : unsigned);
}

export function formatSignedRadix(
  value: number,
  radix: Radix,
  places?: number,
): string | ReturnType<typeof numberError> {
  if (!Number.isInteger(value) || value < negativeMinimum[radix] || value > positiveMaximum[radix])
    return numberError();
  if (places !== undefined && (!Number.isInteger(places) || places < 1 || places > 10)) return numberError();
  if (value < 0) {
    const encoded = (BigInt(1) << BigInt(bits[radix])) + BigInt(value);
    return encoded.toString(radix).toUpperCase().padStart(widths[radix], '0');
  }
  const result = value.toString(radix).toUpperCase();
  if (places !== undefined && result.length > places) return numberError();
  return result.padStart(places ?? 0, '0');
}
