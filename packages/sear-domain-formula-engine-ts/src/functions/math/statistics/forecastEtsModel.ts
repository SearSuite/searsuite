import {
  FormulaErrorCode,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { flatten, isFormulaErrorValue, matrixDimensions, matrixFromArg, readScalar } from '../shared/mathUtils';
import { forecastEtsInputError } from './forecastEtsInput';

type EtsFunction = 'FORECAST.ETS' | 'FORECAST.ETS.CONFINT' | 'FORECAST.ETS.SEASONALITY' | 'FORECAST.ETS.STAT';
type EtsSeries = { values: number[]; timeline: number[]; step: number };
type EtsFit = {
  alpha: number;
  beta: number;
  gamma: number;
  level: number;
  trend: number;
  seasonal: number[];
  period: number;
  actual: number[];
  fitted: number[];
  errors: number[];
};

const valueError = () => createFormulaError(FormulaErrorCode.Value);
const numberError = () => createFormulaError(FormulaErrorCode.Number);
const notAvailable = () => createFormulaError(FormulaErrorCode.NotAvailable);

function option(args: FormulaArg[], index: number, context: EvalContext, fallback: number): number | FormulaError {
  return readScalar(args, index, context, fallback);
}

function vector(arg: FormulaArg, context: EvalContext, allowMissing: boolean): (number | undefined)[] | FormulaError {
  const matrix = matrixFromArg(arg, context);
  if (isFormulaErrorValue(matrix)) return matrix;
  const dimensions = matrixDimensions(matrix);
  if (isFormulaErrorValue(dimensions)) return dimensions;
  if (dimensions[0] > 1 && dimensions[1] > 1) return createFormulaError(FormulaErrorCode.Name);
  const result: (number | undefined)[] = [];
  for (const value of flatten(matrix)) {
    if (isFormulaErrorValue(value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) result.push(value);
    else if (allowMissing && (value === null || value === '')) result.push(undefined);
    else return valueError();
  }
  return result;
}

function aggregate(values: number[], method: number): number {
  const sorted = values.slice().sort((left, right) => left - right);
  switch (method) {
    case 2: return values.length;
    case 3: return values.length;
    case 4: return sorted[sorted.length - 1]!;
    case 5: return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2;
    case 6: return sorted[0]!;
    case 7: return values.reduce((sum, value) => sum + value, 0);
    default: return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}

function prepareSeries(
  args: FormulaArg[], valueIndex: number, timelineIndex: number, context: EvalContext,
  completion: number, aggregation: number,
): EtsSeries | FormulaError {
  const values = vector(args[valueIndex]!, context, true);
  if (isFormulaErrorValue(values)) return values;
  const timeline = vector(args[timelineIndex]!, context, false);
  if (isFormulaErrorValue(timeline)) return timeline;
  if (values.length !== timeline.length || values.length < 2 || values.length > 10_000) return notAvailable();

  const groups = new Map<number, number[]>();
  for (let index = 0; index < values.length; index++) {
    const time = timeline[index]!;
    if (time === undefined) return valueError();
    const bucket = groups.get(time) ?? [];
    if (values[index] !== undefined) bucket.push(values[index]!);
    groups.set(time, bucket);
  }
  const times = [...groups.keys()].sort((left, right) => left - right);
  if (times.length < 2) return notAvailable();
  const differences = times.slice(1).map((time, index) => time - times[index]!);
  const step = Math.min(...differences);
  if (!Number.isFinite(step) || step <= 0) return numberError();
  const span = Math.round((times[times.length - 1]! - times[0]!) / step) + 1;
  if (span > 10_000 || span > times.length * 2) return notAvailable();
  const aggregated = new Map<number, number | undefined>();
  for (const time of times) {
    const index = Math.round((time - times[0]!) / step);
    if (Math.abs(times[0]! + index * step - time) > step * 1e-8 || aggregated.has(index)) return notAvailable();
    const group = groups.get(time)!;
    aggregated.set(index, group.length ? aggregate(group, aggregation) : undefined);
  }
  const observed = [...aggregated.entries()].filter((entry): entry is [number, number] => entry[1] !== undefined);
  const result: number[] = [];
  let nextObservedIndex = 0;
  for (let index = 0; index < span; index++) {
    while (nextObservedIndex < observed.length && observed[nextObservedIndex]![0] < index) nextObservedIndex++;
    const existing = aggregated.get(index);
    if (existing !== undefined) {
      result.push(existing);
      continue;
    }
    if (completion === 0) {
      result.push(0);
      continue;
    }
    const previous = observed[nextObservedIndex - 1];
    const next = observed[nextObservedIndex];
    if (!previous && !next) return notAvailable();
    if (!previous) result.push(next![1]!);
    else if (!next) result.push(previous[1]!);
    else result.push((previous[1]! + next[1]!) / 2);
  }
  return { values: result, timeline: times, step };
}

function detectPeriod(values: number[]): number {
  const count = values.length;
  if (count < 6) return 0;
  const center = (count - 1) / 2;
  const average = values.reduce((sum, value) => sum + value, 0) / count;
  const slope = values.reduce((sum, value, index) => sum + (index - center) * (value - average), 0)
    / values.reduce((sum, _, index) => sum + (index - center) ** 2, 0);
  const residuals = values.map((value, index) => value - average - slope * (index - center));
  if (residuals.reduce((sum, value) => sum + value * value, 0) < 1e-12) return 0;
  for (let period = 2; period <= Math.floor(count / 3); period++) {
    const paired = residuals.slice(period);
    const previous = residuals.slice(0, count - period);
    const numerator = paired.reduce((sum, value, index) => sum + value * previous[index]!, 0);
    const denominator = Math.sqrt(
      paired.reduce((sum, value) => sum + value * value, 0)
      * previous.reduce((sum, value) => sum + value * value, 0),
    );
    if (denominator > 0 && numerator / denominator > 0.8) return period;
  }
  return 0;
}

function fit(values: number[], period: number, alpha: number, beta: number, gamma: number): EtsFit {
  const initialLength = period || 1;
  const firstAverage = values.slice(0, initialLength).reduce((sum, value) => sum + value, 0) / initialLength;
  const secondAverage = period && values.length >= 2 * period
    ? values.slice(period, 2 * period).reduce((sum, value) => sum + value, 0) / period
    : undefined;
  let level = firstAverage;
  let trend = secondAverage === undefined
    ? (values[values.length - 1]! - values[0]!) / (values.length - 1)
    : (secondAverage - firstAverage) / period;
  const seasonal = period ? values.slice(0, period).map((value) => value - firstAverage) : [];
  const fitted: number[] = [];
  const errors: number[] = [];
  for (let index = initialLength; index < values.length; index++) {
    const seasonalValue = period ? seasonal[index % period]! : 0;
    const prediction = level + trend + seasonalValue;
    fitted.push(prediction);
    errors.push(values[index]! - prediction);
    const nextLevel = alpha * (values[index]! - seasonalValue) + (1 - alpha) * (level + trend);
    trend = beta * (nextLevel - level) + (1 - beta) * trend;
    level = nextLevel;
    if (period) seasonal[index % period] = gamma * (values[index]! - level) + (1 - gamma) * seasonalValue;
  }
  return { alpha, beta, gamma, level, trend, seasonal, period, actual: values.slice(initialLength), fitted, errors };
}

function bestFit(values: number[], period: number): EtsFit {
  let best: EtsFit | undefined;
  let bestError = Number.POSITIVE_INFINITY;
  for (const alpha of [0.2, 0.5, 0.8]) {
    for (const beta of [0.1, 0.4, 0.8]) {
      for (const gamma of period ? [0.1, 0.4, 0.8] : [0]) {
        const candidate = fit(values, period, alpha, beta, gamma);
        const error = candidate.errors.reduce((sum, value) => sum + value * value, 0);
        if (error < bestError) {
          best = candidate;
          bestError = error;
        }
      }
    }
  }
  return best!;
}

function statistic(model: EtsFit, type: number, step: number): number {
  if (type === 1) return model.alpha;
  if (type === 2) return model.beta;
  if (type === 3) return model.gamma;
  if (type === 8) return step;
  const count = model.errors.length;
  if (count === 0) return 0;
  const mae = model.errors.reduce((sum, error) => sum + Math.abs(error), 0) / count;
  if (type === 6) return mae;
  if (type === 7) return Math.sqrt(model.errors.reduce((sum, error) => sum + error * error, 0) / count);
  if (type === 5) return model.errors.reduce((sum, error, index) => {
    const denominator = Math.abs(model.actual[index]!) + Math.abs(model.fitted[index]!);
    return sum + (denominator === 0 ? 0 : 2 * Math.abs(error) / denominator);
  }, 0) / count;
  const baseline = model.actual.slice(1).reduce((sum, value, index) =>
    sum + Math.abs(value - model.actual[index]!), 0) / Math.max(1, model.actual.length - 1);
  return baseline === 0 ? 0 : mae / baseline;
}

/** Evaluates the four related ETS functions against one validated additive model. */
export function evaluateForecastEts(
  name: EtsFunction, args: FormulaArg[], context: EvalContext,
  normalInverse: (probability: number) => number | FormulaError,
): FormulaValue {
  const isPrediction = name === 'FORECAST.ETS' || name === 'FORECAST.ETS.CONFINT';
  const isInterval = name === 'FORECAST.ETS.CONFINT';
  const isStat = name === 'FORECAST.ETS.STAT';
  const valueIndex = isPrediction ? 1 : 0;
  const timelineIndex = isPrediction ? 2 : 1;
  const requiredCount = isStat || isPrediction ? 3 : 2;
  const inputError = forecastEtsInputError(args, context, valueIndex, timelineIndex, requiredCount);
  if (inputError) return inputError;
  if (args.length > (isInterval ? 7 : isPrediction ? 6 : isStat ? 6 : 4)) return valueError();

  const seasonIndex = isInterval ? 4 : isPrediction || isStat ? 3 : -1;
  const completionIndex = isInterval ? 5 : isPrediction || isStat ? 4 : 2;
  const aggregationIndex = isInterval ? 6 : isPrediction || isStat ? 5 : 3;
  const seasonality = seasonIndex < 0 ? 1 : option(args, seasonIndex, context, 1);
  const completion = option(args, completionIndex, context, 1);
  const aggregation = option(args, aggregationIndex, context, 1);
  if (isFormulaErrorValue(seasonality)) return seasonality;
  if (isFormulaErrorValue(completion)) return completion;
  if (isFormulaErrorValue(aggregation)) return aggregation;
  if (!Number.isInteger(seasonality) || seasonality < 0
    || !Number.isInteger(completion) || completion < 0 || completion > 1
    || !Number.isInteger(aggregation) || aggregation < 1 || aggregation > 7) return numberError();

  const series = prepareSeries(args, valueIndex, timelineIndex, context, completion, aggregation);
  if (isFormulaErrorValue(series)) return series;
  const detected = detectPeriod(series.values);
  if (name === 'FORECAST.ETS.SEASONALITY') return detected || 1;
  const period = seasonality === 1 ? detected : seasonality;
  if (period > Math.floor(series.values.length / 2)) return numberError();
  const model = bestFit(series.values, period);

  if (isStat) {
    const type = option(args, 2, context, 0);
    if (isFormulaErrorValue(type)) return type;
    return Number.isInteger(type) && type >= 1 && type <= 8 ? statistic(model, type, series.step) : numberError();
  }

  const target = option(args, 0, context, Number.NaN);
  if (isFormulaErrorValue(target)) return target;
  const horizon = (target - series.timeline[series.timeline.length - 1]!) / series.step;
  if (!Number.isFinite(horizon) || horizon <= 0) return numberError();
  if (!isInterval) {
    const seasonal = period ? model.seasonal[(series.values.length - 1 + Math.round(horizon)) % period]! : 0;
    const result = model.level + horizon * model.trend + seasonal;
    return Number.isFinite(result) ? result : numberError();
  }
  const confidence = option(args, 3, context, 0.95);
  if (isFormulaErrorValue(confidence)) return confidence;
  if (confidence <= 0 || confidence >= 1) return numberError();
  const quantile = normalInverse((1 + confidence) / 2);
  if (isFormulaErrorValue(quantile)) return quantile;
  const rmse = statistic(model, 7, series.step);
  const width = quantile * rmse * Math.sqrt(horizon);
  return Number.isFinite(width) ? width : numberError();
}
