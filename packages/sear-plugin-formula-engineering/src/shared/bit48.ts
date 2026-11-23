import type { FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { numberError, valueError } from './errors';
import { numbers } from './functionFactory';

export const MAX_BIT48 = 281_474_976_710_655;

export function bitwiseNumbers(values: readonly FormulaValue[]): number[] | ReturnType<typeof valueError> {
  for (const value of values) {
    const raw = typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'text'
      ? value.value : value;
    if (typeof raw === 'string') {
      if (/^\s*0[xbo]/i.test(raw)) return valueError();
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && !Number.isInteger(parsed)) return numberError();
    }
  }
  return numbers(values);
}

export function bit48(value: number): bigint | ReturnType<typeof numberError> {
  return Number.isFinite(value) && value >= 0 && value <= MAX_BIT48 ? BigInt(Math.trunc(value)) : numberError();
}

export function integerBit48(value: number): bigint | ReturnType<typeof numberError> {
  return Number.isInteger(value) ? bit48(value) : numberError();
}

export function shiftedBit48(value: bigint, shift: number): number | ReturnType<typeof numberError> {
  if (!Number.isInteger(shift) || Math.abs(shift) > 53) return numberError();
  const result = shift >= 0 ? value << BigInt(shift) : value >> BigInt(-shift);
  return result <= BigInt(MAX_BIT48) ? Number(result) : numberError();
}
