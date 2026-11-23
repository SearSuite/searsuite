/**
 * SEQUENCE: Generates a sequential array from a starting value and step.
 * Example: =SEQUENCE(2,3,0,2) returns {0,2,4;6,8,10}.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { MAX_FORMULA_ARRAY_CELLS } from '../../shared/FormulaArrayLimit';
import { isFormulaErrorValue, numberError, readScalar, valueError } from '../shared/mathUtils';

export const SEQUENCE: FormulaFunction = {
  name: 'SEQUENCE',
  evaluate(args, context): FormulaValue {
    if (args.length > 4) return valueError();
    const rawRows = readScalar(args, 0, context);
    if (isFormulaErrorValue(rawRows)) return rawRows;
    const rawColumns = readScalar(args, 1, context, 1);
    if (isFormulaErrorValue(rawColumns)) return rawColumns;
    const rows = Math.trunc(rawRows);
    const columns = Math.trunc(rawColumns);
    const start = readScalar(args, 2, context, 1);
    if (isFormulaErrorValue(start)) return start;
    const step = readScalar(args, 3, context, 1);
    if (isFormulaErrorValue(step)) return step;
    if (!Number.isFinite(rows) || !Number.isFinite(columns) || rows < 1 || columns < 1) return valueError();
    if (rows * columns > MAX_FORMULA_ARRAY_CELLS) return valueError();
    if (!Number.isFinite(start) || !Number.isFinite(step)) return numberError();

    const startParts = decimalParts(start);
    const stepParts = decimalParts(step);
    const exponent = Math.min(startParts.exponent, stepParts.exponent);
    const decimal = Math.max(startParts.exponent, stepParts.exponent) - exponent <= 24
      ? {
          start: startParts.coefficient * BigInt(`1${'0'.repeat(startParts.exponent - exponent)}`),
          step: stepParts.coefficient * BigInt(`1${'0'.repeat(stepParts.exponent - exponent)}`),
        }
      : null;
    return Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => {
        const index = row * columns + column;
        const value = decimal
          ? roundedDecimal(decimal.start + BigInt(index) * decimal.step, exponent)
          : Number((start + index * step).toPrecision(15));
        return Number.isFinite(value) ? value : numberError();
      }),
    );
  },
};

function roundedDecimal(coefficient: bigint, exponent: number): number {
  const zero = BigInt(0);
  const magnitude = coefficient < zero ? -coefficient : coefficient;
  const discardedDigits = Math.max(0, magnitude.toString().length - 15);
  if (discardedDigits === 0) return Number(`${coefficient}e${exponent}`);
  const divisor = BigInt(`1${'0'.repeat(discardedDigits)}`);
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  const rounded = quotient + (remainder * BigInt(2) > divisor ? BigInt(1) : zero);
  return Number(`${coefficient < zero ? -rounded : rounded}e${exponent + discardedDigits}`);
}

function decimalParts(value: number): { coefficient: bigint; exponent: number } {
  const [mantissa, power = '0'] = value.toString().split('e');
  const fractionalDigits = mantissa!.split('.')[1]?.length ?? 0;
  return { coefficient: BigInt(mantissa!.replace('.', '')), exponent: Number(power) - fractionalDigits };
}
