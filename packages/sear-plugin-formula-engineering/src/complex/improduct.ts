/** IMPRODUCT multiplies complex numbers and ranges. Example: =IMPRODUCT("3+4i","5-3i") returns "27+11i". */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isReferenceBackedArgument, matrixArgument } from '../shared/arguments';
import { dateTextAsNumber } from '../shared/computedDateText';
import { parsed } from '../shared/complexOperations';
import { complex, formatComplex, requireSameSuffix, type ComplexNumber } from '../shared/complex';
import { isFormulaError, numberError, valueError } from '../shared/errors';

function scaledProduct(values: readonly ComplexNumber[], suffix: 'i' | 'j'): ComplexNumber {
  let result: ComplexNumber = { real: 1, imaginary: 0, suffix };
  let exponent = 0;
  for (const value of values) {
    const scale = Math.max(Math.abs(value.real), Math.abs(value.imaginary));
    if (scale === 0) return { real: 0, imaginary: 0, suffix };
    const [mantissa, power] = scale.toExponential().split('e');
    result = complex.multiply(result, {
      real: (value.real / scale) * Number(mantissa),
      imaginary: (value.imaginary / scale) * Number(mantissa),
      suffix,
    });
    const resultScale = Math.max(Math.abs(result.real), Math.abs(result.imaginary));
    if (resultScale === 0) return { real: 0, imaginary: 0, suffix };
    const [resultMantissa, resultPower] = resultScale.toExponential().split('e');
    result = {
      real: (result.real / resultScale) * Number(resultMantissa),
      imaginary: (result.imaginary / resultScale) * Number(resultMantissa),
      suffix,
    };
    exponent += Number(power) + Number(resultPower);
  }
  return {
    real: Number(`${result.real}e${exponent}`),
    imaginary: Number(`${result.imaginary}e${exponent}`),
    suffix,
  };
}

export const IMPRODUCT: FormulaFunction = {
  name: 'IMPRODUCT',
  descriptor: {
    version: 1,
    category: 'Engineering',
    summary: 'Multiplies complex numbers.',
    example: '=IMPRODUCT("3+4i","5-3i")',
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
    const direct = parsedValues.reduce((a, b) => complex.multiply(a, b), { real: 1, imaginary: 0, suffix });
    const nonzeroFactors = parsedValues.every((value) => value.real !== 0 || value.imaginary !== 0);
    const result = Number.isFinite(direct.real) && Number.isFinite(direct.imaginary)
      && !(nonzeroFactors && direct.real === 0 && direct.imaginary === 0)
      ? direct : scaledProduct(parsedValues, suffix);
    return formatComplex(result.real, result.imaginary, suffix);
  },
};
