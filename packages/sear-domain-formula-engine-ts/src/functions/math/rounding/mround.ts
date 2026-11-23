/**
 * MROUND: Rounds a number to the nearest specified multiple.
 * Example: =MROUND(10,3) returns 9.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, numberError, readScalar, valueError } from '../shared/mathUtils';

function decimalParts(value: number): { coefficient: bigint; exponent: number } {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value.toString())!;
  const fraction = match[2] ?? '';
  return {
    coefficient: BigInt(match[1]! + fraction),
    exponent: Number(match[3] ?? 0) - fraction.length,
  };
}

export const MROUND: FormulaFunction = {
  name: 'MROUND',
  evaluate(args, context): FormulaValue {
    if (args.length !== 2) return valueError();
    const number = readScalar(args, 0, context);
    if (isFormulaErrorValue(number)) return number;
    const multiple = readScalar(args, 1, context);
    if (isFormulaErrorValue(multiple)) return multiple;
    if (number !== 0 && multiple !== 0 && Math.sign(number) !== Math.sign(multiple)) return numberError();
    if (multiple === 0) return 0;
    if (!Number.isFinite(number) || !Number.isFinite(multiple)) return numberError();
    const input = decimalParts(Math.abs(number));
    const significance = decimalParts(Math.abs(multiple));
    const shift = input.exponent - significance.exponent;
    const numerator = input.coefficient * BigInt(`1${'0'.repeat(Math.max(shift, 0))}`);
    const denominator = significance.coefficient * BigInt(`1${'0'.repeat(Math.max(-shift, 0))}`);
    const quotient = numerator / denominator;
    const rounded = quotient + (BigInt(2) * (numerator % denominator) >= denominator ? BigInt(1) : BigInt(0));
    const result = Number(`${rounded * significance.coefficient}e${significance.exponent}`);
    return Number.isFinite(result) ? Math.sign(number || multiple) * result : numberError();
  },
};
