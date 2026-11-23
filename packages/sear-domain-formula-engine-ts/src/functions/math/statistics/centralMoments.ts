export function standardizedCentralMoments(values: number[]): {
  second: number;
  third: number;
  fourth: number;
} {
  const scale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0) || 1;
  const normalized = values.map((value) => value / scale);
  const average = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
  let second = 0;
  let third = 0;
  let absoluteThird = 0;
  let fourth = 0;
  for (const value of normalized) {
    const deviation = value - average;
    const square = deviation * deviation;
    second += square;
    const cube = square * deviation;
    third += cube;
    absoluteThird += Math.abs(cube);
    fourth += square * square;
  }
  if (Math.abs(third) <= absoluteThird * Number.EPSILON * 8) third = 0;
  return { second, third, fourth };
}
