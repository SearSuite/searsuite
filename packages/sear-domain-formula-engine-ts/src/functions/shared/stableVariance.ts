export function stableVariance(values: number[], sample: boolean): { variance: number; deviation: number } {
  const exactVariance = exactSafeIntegerVariance(values, sample);
  if (exactVariance !== undefined) return { variance: exactVariance, deviation: Math.sqrt(exactVariance) };

  const origin = values[0]!;
  const integerDifferences: number[] = [];
  let integerSum = 0;
  for (const value of values) {
    const difference = value - origin;
    integerSum += difference;
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(difference) || !Number.isSafeInteger(integerSum)) break;
    integerDifferences.push(difference);
  }
  if (values.length > 0 && integerDifferences.length === values.length) {
    const average = integerSum / values.length;
    const divisor = sample ? values.length - 1 : values.length;
    const squaredDifferences = integerDifferences.reduce((sum, value) => sum + (value - average) ** 2, 0);
    const variance = squaredDifferences / divisor;
    if (Number.isFinite(variance)) return { variance, deviation: Math.sqrt(variance) };
  }

  const scale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  if (scale === 0) return { variance: 0, deviation: 0 };

  const normalized = values.map((value) => {
    const difference = value - origin;
    return Number.isFinite(difference) ? difference / scale : value / scale - origin / scale;
  });
  const average = normalized.reduce((sum, value) => sum + value, 0) / values.length;
  const divisor = sample ? values.length - 1 : values.length;
  const unitVariance = normalized.reduce((sum, value) => sum + (value - average) ** 2, 0) / divisor;
  return {
    variance: scale * (scale * unitVariance),
    deviation: scale * Math.sqrt(unitVariance),
  };
}

function exactSafeIntegerVariance(values: number[], sample: boolean): number | undefined {
  const origin = values[0]!;
  if (!Number.isSafeInteger(origin)) return undefined;
  let sum = 0;
  let squaredSum = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) return undefined;
    const difference = value - origin;
    if (!Number.isSafeInteger(difference)) return undefined;
    sum += difference;
    squaredSum += difference * difference;
    if (!Number.isSafeInteger(sum) || !Number.isSafeInteger(squaredSum)) return undefined;
  }
  const count = values.length;
  const total = count * squaredSum;
  const square = sum * sum;
  const divisor = count * (sample ? count - 1 : count);
  if (![total, square, divisor].every(Number.isSafeInteger) || divisor === 0) return undefined;
  const numerator = total - square;
  if (!Number.isSafeInteger(numerator) || numerator % divisor !== 0) return undefined;
  const variance = numerator / divisor;
  return Number.isSafeInteger(variance) ? variance : undefined;
}
