/** IMSUM adds complex numbers and ranges. Example: =IMSUM("3+6i","5-2i") returns "8+4i". */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isReferenceBackedArgument, matrixArgument } from '../shared/arguments';
import { dateTextAsNumber } from '../shared/computedDateText';
import { parsed } from '../shared/complexOperations';
import { complex, formatComplex, requireSameSuffix, roundComputedComplexInteger, type ComplexNumber } from '../shared/complex';
import { isFormulaError, numberError, valueError } from '../shared/errors';

function scaledSum(values: readonly ComplexNumber[], component: 'real' | 'imaginary', scale: number): number {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const term = value[component] / scale;
    const next = sum + term;
    correction += Math.abs(sum) >= Math.abs(term) ? sum - next + term : term - next + sum;
    sum = next;
  }
  return (sum + correction) * scale;
}

export const IMSUM: FormulaFunction = {
  name: 'IMSUM',
  descriptor: {
    version: 1,
    category: 'Engineering',
    summary: 'Adds complex numbers.',
    example: '=IMSUM("3+6i","5-2i")',
    parameters: [{ name: 'inumber', description: 'Complex number or range.', repeating: true, accepts: ['any'] }],
    returnKind: 'scalar',
  },
  evaluate(args, context) {
    if (args.length < 1) return valueError();
    const values: FormulaValue[] = [];
    for (const arg of args) {
      const matrix = matrixArgument(arg, context);
      if (isFormulaError(matrix)) return matrix;
      if (isReferenceBackedArgument(arg, context) && matrix.some((row) => row.some((value) => typeof value === 'boolean')))
        return numberError();
      values.push(...matrix.flat().map((value) => dateTextAsNumber(value, context)));
    }
    const parsedValues: ComplexNumber[] = [];
    for (const value of values) {
      const z = parsed(value);
      if (isFormulaError(z)) return z;
      parsedValues.push(z);
    }
    const suffix = requireSameSuffix(parsedValues);
    if (isFormulaError(suffix)) return suffix;
    const direct = parsedValues.reduce((a, b) => complex.add(a, b), { real: 0, imaginary: 0, suffix });
    const scale = parsedValues.reduce((maximum, value) =>
      Math.max(maximum, Math.abs(value.real), Math.abs(value.imaginary)), 0);
    const result = Number.isFinite(direct.real) && Number.isFinite(direct.imaginary) || scale === 0
      ? direct
      : { real: scaledSum(parsedValues, 'real', scale), imaginary: scaledSum(parsedValues, 'imaginary', scale), suffix };
    return formatComplex(roundComputedComplexInteger(result.real), result.imaginary, suffix);
  },
};
