import type { FormulaError, FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { complex, complexPower, formatComplex, parseComplex, type ComplexNumber } from './complex';
import { isFormulaError, numberError, valueError } from './errors';

export function parsed(value: FormulaValue): ComplexNumber | ReturnType<typeof valueError> {
  if (isFormulaError(value)) return value;
  if (typeof value === 'number' || typeof value === 'string') return parseComplex(value);
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'text')
    return parseComplex(value.value);
  return valueError();
}

export function unaryComplex(
  value: FormulaValue,
  operation: (z: ComplexNumber) => ComplexNumber | FormulaError,
  fullPrecision: boolean | ((z: ComplexNumber) => boolean) = false,
): FormulaValue {
  const z = parsed(value);
  if (isFormulaError(z)) return z;
  const result = operation(z);
  if (isFormulaError(result)) return result;
  return formatComplex(result.real, result.imaginary, z.suffix,
    typeof fullPrecision === 'function' ? fullPrecision(z) : fullPrecision);
}

export function unaryComplexTrig(value: FormulaValue, operation: (z: ComplexNumber) => ComplexNumber): FormulaValue {
  return unaryComplex(value, (z) => Math.abs(z.real) >= 2 ** 27 ? numberError() : operation(z));
}

export function reciprocalComplex(value: ComplexNumber, zeroIsNumberError = false): ComplexNumber | FormulaError {
  if (value.real === 0 && value.imaginary === 0) return zeroIsNumberError ? numberError() : complex.divide({ ...value, real: 1, imaginary: 0 }, value);
  if (!Number.isFinite(value.real) || !Number.isFinite(value.imaginary)) {
    return { ...value, real: 0, imaginary: 0 };
  }
  return complex.divide({ ...value, real: 1, imaginary: 0 }, value);
}

export const operations = {
  cot: (z: ComplexNumber): ComplexNumber => {
    if (z.imaginary === 0) {
      const result = Number.isInteger(z.real)
        ? Math.cos(z.real) / Math.sin(z.real)
        : 1 / Math.tan(z.real);
      return { ...z, real: Math.abs(z.real) >= 1e12 ? Number(result.toPrecision(16)) : result, imaginary: 0 };
    }
    if (z.real === 0 && Math.abs(z.imaginary) < 1e-7) {
      return { ...z, real: 0, imaginary: -1 / Math.tanh(z.imaginary) };
    }
    const denominator = Math.cosh(2 * z.imaginary) - Math.cos(2 * z.real);
    if (!Number.isFinite(denominator)) return { ...z, real: 0, imaginary: -Math.sign(z.imaginary) };
    return {
      ...z,
      real: Math.sin(2 * z.real) / denominator,
      imaginary: -Math.sinh(2 * z.imaginary) / denominator,
    };
  },
  cos: (z: ComplexNumber): ComplexNumber => ({
    ...z,
    real: Math.cos(z.real) * Math.cosh(z.imaginary),
    imaginary: -Math.sin(z.real) * Math.sinh(z.imaginary),
  }),
  sin: (z: ComplexNumber): ComplexNumber => ({
    ...z,
    real: Math.sin(z.real) * Math.cosh(z.imaginary),
    imaginary: Math.cos(z.real) * Math.sinh(z.imaginary),
  }),
  tan: (z: ComplexNumber): ComplexNumber => {
    if (z.imaginary === 0) return { ...z, real: Math.sin(z.real) / Math.cos(z.real), imaginary: 0 };
    const denominator = Math.cosh(2 * z.imaginary) + Math.cos(2 * z.real);
    if (!Number.isFinite(denominator)) return { ...z, real: 0, imaginary: Math.sign(z.imaginary) };
    return {
      ...z,
      real: Math.sin(2 * z.real) / denominator,
      imaginary: Math.sinh(2 * z.imaginary) / denominator,
    };
  },
  cosh: (z: ComplexNumber): ComplexNumber => ({
    ...z,
    real: Math.cosh(z.real) * Math.cos(z.imaginary),
    imaginary: Math.sinh(z.real) * Math.sin(z.imaginary),
  }),
  sinh: (z: ComplexNumber): ComplexNumber => ({
    ...z,
    real: Math.sinh(z.real) * Math.cos(z.imaginary),
    imaginary: Math.cosh(z.real) * Math.sin(z.imaginary),
  }),
  exp: complex.exp,
  log: complex.log,
  sqrt: (z: ComplexNumber): ComplexNumber => complexPower(z, 0.5),
};
