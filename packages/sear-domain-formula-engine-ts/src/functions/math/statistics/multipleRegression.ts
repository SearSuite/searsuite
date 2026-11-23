export type RegressionStatistics = {
  standardErrors: number[];
  rSquared: number;
  standardErrorY: number;
  fStatistic: number;
  degreesOfFreedom: number;
  regressionSumSquares: number;
  residualSumSquares: number;
};

export type MultipleRegressionModel = {
  coefficients: number[];
  intercept: number;
  statistics?: RegressionStatistics;
};

export function multipleRegression(
  predictors: number[][],
  values: number[],
  includeConstant: boolean,
  includeStatistics = false,
): MultipleRegressionModel | undefined {
  const sampleCount = values.length;
  const predictorCount = predictors[0]?.length ?? 0;
  const columnCount = predictorCount + Number(includeConstant);
  if (sampleCount < columnCount || predictorCount === 0) return undefined;

  const columns = Array.from({ length: columnCount }, (_, index) =>
    predictors.map((row) => includeConstant && index === 0 ? 1 : row[index - Number(includeConstant)]!),
  );
  const scales = columns.map((column) => column.reduce((scale, value) => Math.max(scale, Math.abs(value)), 0));
  if (scales.some((scale) => scale === 0 || !Number.isFinite(scale))) return undefined;
  const orthogonal: number[][] = [];
  const upper = Array.from({ length: columnCount }, () => Array<number>(columnCount).fill(0));

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
    const vector = columns[columnIndex]!.map((value) => value / scales[columnIndex]!);
    for (let previous = 0; previous < columnIndex; previous++) {
      const projection = vector.reduce((sum, value, row) => sum + value * orthogonal[previous]![row]!, 0);
      upper[previous]![columnIndex] = projection;
      for (let row = 0; row < sampleCount; row++) vector[row] -= projection * orthogonal[previous]![row]!;
    }
    const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (length <= 1e-12 * Math.sqrt(sampleCount)) return undefined;
    upper[columnIndex]![columnIndex] = length;
    orthogonal.push(vector.map((value) => value / length));
  }

  const projected = orthogonal.map((column) =>
    column.reduce((sum, value, row) => sum + value * values[row]!, 0),
  );
  const coefficients = Array<number>(columnCount).fill(0);
  for (let index = columnCount - 1; index >= 0; index--) {
    let remainder = projected[index]!;
    for (let next = index + 1; next < columnCount; next++) {
      remainder -= upper[index]![next]! * coefficients[next]!;
    }
    coefficients[index] = remainder / upper[index]![index]!;
  }
  const scaled = coefficients.map((value, index) => value / scales[index]!);
  const model: MultipleRegressionModel = {
    coefficients: includeConstant ? scaled.slice(1) : scaled,
    intercept: includeConstant ? scaled[0]! : 0,
  };
  if (!includeStatistics) return model;

  const degreesOfFreedom = sampleCount - columnCount;
  const average = includeConstant ? values.reduce((sum, value) => sum + value, 0) / sampleCount : 0;
  const totalSumSquares = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
  const residualSumSquares = values.reduce((sum, value, row) => {
    const predicted = predictors[row]!.reduce(
      (result, predictor, index) => result + predictor * model.coefficients[index]!,
      model.intercept,
    );
    return sum + (value - predicted) ** 2;
  }, 0);
  const regressionSumSquares = Math.max(0, totalSumSquares - residualSumSquares);
  const standardErrorY = degreesOfFreedom > 0
    ? Math.sqrt(residualSumSquares / degreesOfFreedom) : Number.NaN;
  const inverseUpper = Array.from({ length: columnCount }, () => Array<number>(columnCount).fill(0));
  for (let column = 0; column < columnCount; column++) {
    for (let row = columnCount - 1; row >= 0; row--) {
      let remainder = Number(row === column);
      for (let next = row + 1; next < columnCount; next++) {
        remainder -= upper[row]![next]! * inverseUpper[next]![column]!;
      }
      inverseUpper[row]![column] = remainder / upper[row]![row]!;
    }
  }
  const errors = inverseUpper.map((row, index) =>
    standardErrorY * Math.sqrt(row.reduce((sum, value) => sum + value ** 2, 0)) / scales[index]!,
  );
  model.statistics = {
    standardErrors: includeConstant ? errors.slice(1).reverse().concat(errors[0]!) : errors.reverse().concat(Number.NaN),
    rSquared: totalSumSquares === 0 ? Number.NaN : 1 - residualSumSquares / totalSumSquares,
    standardErrorY,
    fStatistic: degreesOfFreedom > 0 && residualSumSquares > 0
      ? regressionSumSquares / predictorCount / (residualSumSquares / degreesOfFreedom) : Number.NaN,
    degreesOfFreedom,
    regressionSumSquares,
    residualSumSquares,
  };
  return model;
}
