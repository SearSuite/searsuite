export function truncate(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  if (digits >= 0) {
    const factor = 10 ** digits;
    if (!Number.isFinite(factor)) return value;
    if (!Number.isFinite(value * factor)) return value;
    return Math.trunc(value * factor) / factor;
  }
  const factor = 10 ** -digits;
  if (!Number.isFinite(factor)) return 0;
  return Math.trunc(value / factor) * factor;
}

interface ScaledNumber { mantissa: number; exponent: number }

function scaledProduct(values: number[]): ScaledNumber {
  let mantissa = 1;
  let exponent = 0;
  for (const value of values) {
    if (value === 0) return { mantissa: 0, exponent: 0 };
    const [coefficient, power] = value.toExponential().split('e');
    mantissa *= Number(coefficient);
    exponent += Number(power);
    const shift = Math.floor(Math.log10(Math.abs(mantissa)));
    mantissa /= 10 ** shift;
    exponent += shift;
  }
  return { mantissa, exponent };
}

export function finiteProduct(values: number[]): number {
  const { mantissa, exponent } = scaledProduct(values);
  return Number(`${mantissa}e${exponent}`);
}

export function finiteSumProducts(terms: number[][]): number {
  const products = terms.map(scaledProduct).filter(({ mantissa }) => mantissa !== 0);
  if (products.length === 0) return 0;
  const largestExponent = products.reduce((largest, { exponent }) => Math.max(largest, exponent), -Infinity);
  const sum = products.reduce(
    (total, { mantissa, exponent }) => total + mantissa * 10 ** (exponent - largestExponent), 0,
  );
  return sum === 0 ? 0 : Number(`${sum}e${largestExponent}`);
}
