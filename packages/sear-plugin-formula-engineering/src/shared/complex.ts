import { divisionError, numberError, valueError } from './errors';

export interface ComplexNumber {
  readonly real: number;
  readonly imaginary: number;
  readonly suffix: 'i' | 'j';
}

const decimalPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseDecimal(source: string): number | null {
  if (!decimalPattern.test(source)) return null;
  const value = Number(source);
  return Number.isFinite(value) ? value : null;
}

export function parseComplex(input: string | number): ComplexNumber | ReturnType<typeof valueError> {
  if (typeof input === 'number') return { real: input, imaginary: 0, suffix: 'i' };
  const source = input.trim();
  if (source === '' || /[IJ]/.test(source)) return numberError();
  const suffix: 'i' | 'j' = source.endsWith('j') ? 'j' : 'i';
  if (!/[ij]$/.test(source)) {
    const real = parseDecimal(source);
    return real === null ? numberError() : { real, imaginary: 0, suffix };
  }
  const body = source.slice(0, -1);
  let split = -1;
  for (let index = 1; index < body.length; index++) {
    if ((body[index] === '+' || body[index] === '-') && body[index - 1] !== 'e' && body[index - 1] !== 'E')
      split = index;
  }
  const realText = split < 0 ? '0' : body.slice(0, split);
  const imaginaryText = split < 0 ? body : body.slice(split);
  const real = parseDecimal(realText);
  const imaginary =
    imaginaryText === '' || imaginaryText === '+' ? 1 : imaginaryText === '-' ? -1 : parseDecimal(imaginaryText);
  return real !== null && imaginary !== null ? { real, imaginary, suffix } : numberError();
}

function clean(value: number): number {
  if (Number.isSafeInteger(value)) return value;
  return Number(value.toPrecision(15));
}

export function roundComputedComplexInteger(value: number): number {
  if (!Number.isSafeInteger(value) || Math.abs(value) < 1e15) return value;
  const magnitude = Math.abs(value);
  const quotient = Math.trunc(magnitude / 10);
  const remainder = magnitude - quotient * 10;
  const roundUp = remainder > 5 || (remainder === 5 && quotient % 2 === 1);
  return Math.sign(value) * (quotient + Number(roundUp)) * 10;
}

function formatNumber(value: number, fullPrecision = false): string {
  const text = !fullPrecision && value !== 0 && Math.abs(value) < 1e-5
    ? value.toExponential(14).replace(/\.?(0+)e/, 'e')
    : String(value);
  const scientific = /^(-?)(\d)(?:\.(\d+))?e([+-])(\d+)$/.exec(text);
  if (!scientific) return text;
  const [, sign, integer, fractional = '', exponentSign, exponentDigits] = scientific;
  const exponent = Number(exponentDigits) * (exponentSign === '-' ? -1 : 1);
  if (exponent < 0) {
    const decimal = `${sign}0.${'0'.repeat(-exponent - 1)}${integer}${fractional}`;
    if (decimal.length <= 15) return decimal;
  }
  return `${sign}${integer}${fractional ? `.${fractional}` : ''}E${exponentSign}${exponentDigits.padStart(2, '0')}`;
}

export function formatComplex(
  real: number,
  imaginary: number,
  suffix: 'i' | 'j' = 'i',
  fullPrecision = false,
): string | ReturnType<typeof numberError> {
  if (!fullPrecision) {
    real = clean(real);
    imaginary = clean(imaginary);
  }
  if (!Number.isFinite(real) || !Number.isFinite(imaginary)) return numberError();
  if (imaginary === 0) return formatNumber(real, fullPrecision);
  const coefficient = Math.abs(imaginary) === 1 ? '' : formatNumber(Math.abs(imaginary), fullPrecision);
  if (real === 0) return `${imaginary < 0 ? '-' : ''}${coefficient}${suffix}`;
  return `${formatNumber(real, fullPrecision)}${imaginary < 0 ? '-' : '+'}${coefficient}${suffix}`;
}

export function requireSameSuffix(values: readonly ComplexNumber[]): 'i' | 'j' | ReturnType<typeof valueError> {
  const nonReal = values.filter((value) => value.imaginary !== 0);
  const suffix = nonReal[0]?.suffix ?? values[0]?.suffix ?? 'i';
  return nonReal.every((value) => value.suffix === suffix) ? suffix : valueError();
}

export const complex = {
  add: (a: ComplexNumber, b: ComplexNumber): ComplexNumber => ({
    ...a,
    real: a.real + b.real,
    imaginary: a.imaginary + b.imaginary,
  }),
  subtract: (a: ComplexNumber, b: ComplexNumber): ComplexNumber => ({
    ...a,
    real: a.real - b.real,
    imaginary: a.imaginary - b.imaginary,
  }),
  multiply: (a: ComplexNumber, b: ComplexNumber): ComplexNumber => ({
    ...a,
    real: a.real * b.real - a.imaginary * b.imaginary,
    imaginary: a.real * b.imaginary + a.imaginary * b.real,
  }),
  divide(a: ComplexNumber, b: ComplexNumber): ComplexNumber | ReturnType<typeof divisionError> {
    const directDenominator = b.real * b.real + b.imaginary * b.imaginary;
    if (directDenominator !== 0 && Number.isFinite(directDenominator)) {
      const real = (a.real * b.real + a.imaginary * b.imaginary) / directDenominator;
      const imaginary = (a.imaginary * b.real - a.real * b.imaginary) / directDenominator;
      if (Number.isFinite(real) && Number.isFinite(imaginary)) return { ...a, real, imaginary };
    }
    const scale = Math.max(Math.abs(b.real), Math.abs(b.imaginary));
    if (scale === 0) return divisionError();
    const real = b.real / scale;
    const imaginary = b.imaginary / scale;
    const denominator = real * real + imaginary * imaginary;
    const dividendReal = a.real / scale;
    const dividendImaginary = a.imaginary / scale;
    return {
      ...a,
      real: (dividendReal * real + dividendImaginary * imaginary) / denominator,
      imaginary: (dividendImaginary * real - dividendReal * imaginary) / denominator,
    };
  },
  exp: (z: ComplexNumber): ComplexNumber => ({
    ...z,
    real: Math.exp(z.real) * Math.cos(z.imaginary),
    imaginary: Math.exp(z.real) * Math.sin(z.imaginary),
  }),
  log: (z: ComplexNumber): ComplexNumber => ({
    ...z,
    real: Math.log(Math.hypot(z.real, z.imaginary)),
    imaginary: Math.atan2(z.imaginary, z.real),
  }),
};

export function complexPower(z: ComplexNumber, power: number): ComplexNumber {
  if (z.imaginary === 0 && z.real < 0 && Number.isInteger(power) && Math.abs(power) >= 1e6)
    return { ...z, real: Math.pow(z.real, power), imaginary: 0 };
  const modulus = Math.hypot(z.real, z.imaginary);
  const radius = modulus === 0 || power === 0.5 || Number.isInteger(power) && power >= 0
    ? Math.pow(modulus, power)
    : Math.exp(power * Math.log(modulus));
  const angle = Math.atan2(z.imaginary, z.real) * power;
  const real = radius * Math.cos(angle);
  const imaginary = radius * Math.sin(angle);
  if (z.imaginary === 0 && z.real < 0) {
    if (power === 0.5) return { ...z, real: Math.abs(real) < 1e-12 ? 0 : real, imaginary };
    if (Number.isInteger(power))
      return { ...z, real, imaginary: Math.abs(imaginary) < 1e-12 ? 0 : imaginary };
  }
  return { ...z, real, imaginary };
}
