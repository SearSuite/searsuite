// @ts-nocheck
import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaFunction,
  type FormulaRangeCell,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { erf, erfc, isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { forEachFormulaRangeCellWithMetadata, matchesCriteria, readArg } from '../../shared/helpers';
import { collectReferenceCells, flatten, isRangeArgument, matrixFromArg } from '../shared/mathUtils';
import { directStatisticalNumber, statisticalScalarNumber } from './statisticalInput';
import { isBlankScalarInput } from '../../shared/blankScalarInput';
import { numericDateText } from '../../shared/formulaNumericDateText';
import { resolveConditionalReference } from '../../shared/conditionalReference';
import { regressionInputShape, regressionInputSize, sameRegressionInputShape } from './regressionInputShape';
import { multipleRegression, type RegressionStatistics } from './multipleRegression';
import { standardizedCentralMoments } from './centralMoments';
import { stableVariance } from '../../shared/stableVariance';
import { evaluateForecastEts } from './forecastEtsModel';

type NumResult = any;
type CellEntry = { value: FormulaValue; cell?: FormulaRangeCell };

const PI2 = Math.PI * 2;
const EPSILON = 1e-12;

function error(code: (typeof FormulaErrorCode)[keyof typeof FormulaErrorCode]): FormulaError {
  return createFormulaError(code);
}

function valueError(): FormulaError {
  return error(FormulaErrorCode.Value);
}

function numberError(): FormulaError {
  return error(FormulaErrorCode.Number);
}

function divisionError(): FormulaError {
  return error(FormulaErrorCode.DivisionByZero);
}

function isError(value: unknown): value is FormulaError {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'error';
}

function isBlankEntry(entry: CellEntry): boolean {
  return (
    entry.cell?.source === 'empty' || entry.value === '' || (isFormulaText(entry.value) && entry.value.value === '')
  );
}

function scalar(value: FormulaValue): FormulaValue {
  return Array.isArray(value) ? valueError() : value;
}

function directNumber(value: FormulaValue): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (isFormulaText(value) && value.numericCoercion === 'allow') {
    const parsed = Number(value.value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function numericCell(value: FormulaValue): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function entriesForArg(arg: FormulaArg, context: EvalContext): CellEntry[] | FormulaError {
  if (!arg) return valueError();
  const reference = resolveConditionalReference(arg, context);
  if (reference) {
    if ('kind' in reference) return reference;
    const result: CellEntry[] = [];
    const error = forEachFormulaRangeCellWithMetadata(reference, context, (cell) => {
      result.push({ value: cell.value, cell });
    });
    return error ?? result;
  }
  const cells = collectReferenceCells(arg, context);
  if (isError(cells)) return cells;
  const result: CellEntry[] = [];
  for (const entry of cells) {
    if (typeof entry === 'object' && entry !== null && 'value' in entry && 'row' in entry) {
      result.push({ value: entry.value, cell: entry });
    } else {
      for (const value of flatten(entry)) result.push({ value });
    }
  }
  return result;
}

function entries(args: FormulaArg[], context: EvalContext): CellEntry[] | FormulaError {
  const result: CellEntry[] = [];
  for (const arg of args) {
    if (isFormulaArgumentKind(arg, 'missing')) continue;
    const next = entriesForArg(arg, context);
    if (isError(next)) return next;
    result.push(...next);
  }
  return result;
}

function numericValues(
  args: FormulaArg[],
  context: EvalContext,
  options: { directBooleans?: boolean; directText?: boolean } = {},
): any {
  const result: number[] = [];
  for (const arg of args) {
    const next = entriesForArg(arg, context);
    if (isError(next)) return next;
    const reference = isRangeArgument(arg);
    for (const entry of next) {
      if (isError(entry.value)) return entry.value;
      if (reference && entry.cell?.source === 'empty') continue;
      const numeric = reference
        ? numericCell(entry.value)
        : typeof entry.value === 'number'
        ? entry.value
        : options.directBooleans || options.directText
        ? directNumber(entry.value)
        : undefined;
      if (numeric !== undefined && Number.isFinite(numeric)) result.push(numeric);
    }
  }
  return result;
}

function deviationValues(args: FormulaArg[], context: EvalContext): number[] | FormulaError {
  const result: number[] = [];
  for (const arg of args) {
    if (isBlankScalarInput(arg, context)) continue;
    const direct = directStatisticalNumber(arg, context);
    if (isError(direct)) return direct;
    if (direct !== undefined) {
      result.push(direct);
      continue;
    }
    const values = numericValues([arg], context);
    if (isError(values)) return values;
    result.push(...values);
  }
  return result;
}

function allValues(args: FormulaArg[], context: EvalContext): CellEntry[] | FormulaError {
  return entries(args, context);
}

function aSeriesNumber(entry: CellEntry, context: EvalContext): number | FormulaError | undefined {
  if (entry.cell?.source === 'empty') return undefined;
  if (isError(entry.value)) return entry.value;
  if (typeof entry.value === 'number') return entry.value;
  if (typeof entry.value === 'boolean') return entry.value ? 1 : 0;
  if (entry.cell) return 0;
  const text = isFormulaText(entry.value) ? entry.value.value : entry.value;
  if (typeof text !== 'string') return 0;
  if (text.trim() === '') return valueError();
  const number = toNumberOrError(text);
  return isError(number) ? numericDateText(text, context) ?? valueError() : number;
}

function checkCount(args: FormulaArg[], min: number, max = Number.POSITIVE_INFINITY): FormulaError | undefined {
  return args.length < min || args.length > max ? valueError() : undefined;
}

function readNumber(
  args: FormulaArg[],
  index: number,
  context: EvalContext,
  fallback?: number,
  parseDateText = true,
): NumResult {
  const arg = args[index];
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return fallback === undefined ? valueError() : fallback;
  const value = scalar(readArg(arg, context));
  if (isError(value)) return value;
  if (value === '' || (isFormulaText(value) && value.value === '')) return valueError();
  const numeric = toNumberOrError(value);
  return isError(numeric) ? (parseDateText ? numericDateText(value, context) ?? valueError() : valueError()) : numeric;
}

function readOptionalNumber(args: FormulaArg[], index: number, context: EvalContext): NumResult | undefined {
  const arg = args[index];
  return !arg || isFormulaArgumentKind(arg, 'missing') ? undefined : readNumber(args, index, context);
}

function confidenceInputs(
  args: FormulaArg[],
  context: EvalContext,
  minimumSize: number,
): [number, number, number] | FormulaError {
  if (args.length !== 3) return valueError();
  const values = args.map((_, index) => readNumber(args, index, context));
  const firstError = values.find(isError);
  if (firstError) return firstError;
  const [alpha, deviation, size] = values as number[];
  const sampleSize = Math.trunc(size);
  if (alpha <= 0 || alpha >= 1 || deviation <= 0 || sampleSize < minimumSize) return numberError();
  return [alpha, deviation, sampleSize];
}

function readBoolean(args: FormulaArg[], index: number, context: EvalContext, fallback?: boolean): any {
  const arg = args[index];
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return fallback === undefined ? valueError() : fallback;
  const value = scalar(readArg(arg, context));
  if (isError(value)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = isFormulaText(value) ? value.value : value;
  if (typeof text === 'string') {
    if (/^true$/i.test(text.trim())) return true;
    if (/^false$/i.test(text.trim())) return false;
  }
  return valueError();
}

function flattenNumbers(value: FormulaValue): number[] | FormulaError {
  const result: number[] = [];
  for (const item of flatten(value)) {
    if (isError(item)) return item;
    const numeric = numericCell(item);
    if (numeric !== undefined) result.push(numeric);
  }
  return result;
}

function pairValues(args: FormulaArg[], context: EvalContext, zeroTextCells = false): any {
  if (args.length !== 2) return valueError();
  const left = entriesForArg(args[0]!, context);
  const right = entriesForArg(args[1]!, context);
  if (isError(left)) return left;
  if (isError(right)) return right;
  if (left.length !== right.length) {
    if (args.some((arg) => isBlankScalarInput(arg, context))) return valueError();
    for (const [index, operand] of [left, right].entries()) {
      if (operand.length !== 1) continue;
      const value = operand[0]!.value;
      if (isError(value)) return value;
      if (args[index]?.kind === 'value' && Array.isArray(args[index].value)) continue;
      if (typeof value !== 'number') return valueError();
    }
    return error(FormulaErrorCode.NotAvailable);
  }
  for (const entry of [...left, ...right]) {
    if (isError(entry.value)) return entry.value;
  }
  const x: number[] = [];
  const y: number[] = [];
  const count = Math.min(left.length, right.length);
  for (let index = 0; index < count; index++) {
    if (left[index]!.cell?.source === 'empty' || right[index]!.cell?.source === 'empty') continue;
    const xv =
      numericCell(left[index]!.value) ??
      (zeroTextCells &&
      left[index]!.cell &&
      (typeof left[index]!.value === 'string' || isFormulaText(left[index]!.value))
        ? 0
        : undefined);
    const yv =
      numericCell(right[index]!.value) ??
      (zeroTextCells &&
      right[index]!.cell &&
      (typeof right[index]!.value === 'string' || isFormulaText(right[index]!.value))
        ? 0
        : undefined);
    if (xv !== undefined && yv !== undefined) {
      x.push(xv);
      y.push(yv);
    }
  }
  return x.length === y.length ? [x, y] : valueError();
}

function expressionScalarAgainstRange(args: FormulaArg[], context: EvalContext): boolean {
  if (args.length !== 2) return false;
  const operands = args.map((arg) => entriesForArg(arg, context));
  if (operands.some(isError)) return false;
  if (operands.some((entries) => entries.some((entry) => isError(entry.value)))) return false;
  return args.some((arg, index) => {
    if (operands[index].length !== 1 || operands[1 - index].length <= 1) return false;
    const value = operands[index][0]!.value;
    if (typeof value === 'number') return false;
    return (
      (typeof value === 'boolean' || typeof value === 'string' || isFormulaText(value)) &&
      (arg.kind === 'expression' ||
        (arg.kind === 'value' &&
          (arg.sourceKind === FormulaNodeKind.Boolean || arg.sourceAst?.kind === FormulaNodeKind.Call)))
    );
  });
}

function mean(values: number[]): NumResult {
  if (values.length === 0) return divisionError();
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number.isFinite(total) ? total / values.length : values.reduce((sum, value) => sum + value / values.length, 0);
}

function variance(values: number[], sample: boolean): NumResult {
  if (values.length < (sample ? 2 : 1)) return divisionError();
  return stableVariance(values, sample).variance;
}

function standardDeviation(values: number[], sample: boolean): NumResult {
  if (values.length < (sample ? 2 : 1)) return divisionError();
  return stableVariance(values, sample).deviation;
}

function sorted(values: number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

function percentile(values: number[], k: number, exclusive: boolean): NumResult {
  if (values.length === 0 || k < 0 || k > 1 || (exclusive && (k <= 0 || k >= 1))) return numberError();
  const ordered = sorted(values);
  const index = exclusive ? k * (ordered.length + 1) - 1 : k * (ordered.length - 1);
  if (exclusive && (index < 0 || index > ordered.length - 1)) return numberError();
  if (index <= 0) return ordered[0]!;
  if (index >= ordered.length - 1) return ordered[ordered.length - 1]!;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return interpolate(ordered[lower]!, ordered[lower + 1]!, fraction);
}

function interpolate(lower: number, upper: number, fraction: number): number {
  const difference = upper - lower;
  return Number.isFinite(difference) ? lower + fraction * difference : lower * (1 - fraction) + upper * fraction;
}

function rankValue(number: number, values: number[], order: number): number {
  const descending = order === 0;
  const ordered = [...values].sort((a, b) => (descending ? b - a : a - b));
  const index = ordered.findIndex((value) => value === number);
  return index < 0 ? numberError() : index + 1;
}

function betaLog(a: number, b: number): number {
  const smallInteger =
    Number.isInteger(a) && a >= 1 && a <= 16 ? a : Number.isInteger(b) && b >= 1 && b <= 16 ? b : undefined;
  if (smallInteger !== undefined) {
    const other = smallInteger === a ? b : a;
    let result = 0;
    for (let index = 2; index < smallInteger; index++) result += Math.log(index);
    for (let index = 0; index < smallInteger; index++) result -= Math.log(other + index);
    return result;
  }
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

function logGamma(value: number): number {
  if (value <= 0 && Math.abs(value - Math.round(value)) < EPSILON) return Number.POSITIVE_INFINITY;
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = 0.9999999999998099;
  const shifted = value - 1;
  for (let index = 0; index < coefficients.length; index++) x += coefficients[index]! / (shifted + index + 1);
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(PI2) + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

function gamma(value: number): NumResult {
  if (value <= 0 && Number.isInteger(value)) return numberError();
  if (Number.isInteger(value) && value <= 171) {
    let factorial = 1;
    for (let factor = 2; factor < value; factor++) factorial *= factor;
    return factorial;
  }
  const nearestInteger = Math.round(value);
  const sinPi = Math.sin(Math.PI * (value - nearestInteger)) * (nearestInteger % 2 === 0 ? 1 : -1);
  const result = value < 0 ? Math.PI / (sinPi * Math.exp(logGamma(1 - value))) : Math.exp(logGamma(value));
  return Number.isFinite(result) ? result : numberError();
}

function logGammaSeriesFactor(shape: number, value: number): number {
  if (shape < 128) return -value + shape * Math.log(value) - logGamma(shape);
  const relative = (value - shape) / shape;
  let log1pmx = Math.log1p(relative) - relative;
  if (Math.abs(relative) < 0.1) {
    log1pmx = 0;
    let term = (-relative * relative) / 2;
    for (let order = 2; order < 64; order++) {
      log1pmx += term;
      if (Math.abs(term) < 1e-19) break;
      term *= (-relative * order) / (order + 1);
    }
  }
  const reciprocal = 1 / shape;
  const correction = reciprocal / 12 - reciprocal ** 3 / 360 + reciprocal ** 5 / 1260;
  return shape * log1pmx + 0.5 * Math.log(shape / PI2) - correction;
}

function regularizedGammaP(shape: number, value: number): number {
  if (value <= 0) return 0;
  if (value >= shape + 1) return 1 - regularizedGammaQ(shape, value);
  let sum = 1 / shape;
  let term = sum;
  for (let index = 1; index < 10000; index++) {
    term *= value / (shape + index);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
  }
  return sum * Math.exp(logGammaSeriesFactor(shape, value));
}

function regularizedGammaQ(shape: number, value: number): number {
  if (value <= 0) return 1;
  if (value < shape + 1) return 1 - regularizedGammaP(shape, value);
  let b = value + 1 - shape;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let index = 1; index < 1000; index++) {
    const an = -index * (index - shape);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.exp(logGammaSeriesFactor(shape, value)) * h;
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let index = 1; index <= maxIterations; index++) {
    const m2 = 2 * index;
    let numerator = (index * (b - index) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    numerator = (-(a + index) * (a + b + index) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) break;
  }
  return h;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(a * Math.log(x) + b * Math.log1p(-x) - betaLog(a, b));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function normalCdf(value: number): number {
  const standardized = value / Math.SQRT2;
  return value < 0 ? erfc(-standardized) / 2 : 1 - erfc(standardized) / 2;
}

function normalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function standardize(value: number, average: number, deviation: number): number {
  const difference = value - average;
  return Number.isFinite(difference) ? difference / deviation : value / deviation - average / deviation;
}

function scaledNormalQuantile(average: number, deviation: number, quantile: number): number {
  const scaled = deviation * quantile;
  return Number.isFinite(scaled) ? average + scaled : (average / deviation + quantile) * deviation;
}

function normalizeRangeValue(value: number, lower: number, upper: number): number {
  const span = upper - lower;
  if (Number.isFinite(span)) return (value - lower) / span;
  const scale = Math.max(Math.abs(lower), Math.abs(upper));
  return (value / scale - lower / scale) / (upper / scale - lower / scale);
}

function interpolateRange(lower: number, upper: number, fraction: number): number {
  const span = upper - lower;
  return Number.isFinite(span) ? lower + fraction * span : lower * (1 - fraction) + upper * fraction;
}

function normalInverse(probability: number): NumResult {
  if (probability <= 0 || probability >= 1) return numberError();
  const coefficients = {
    a: [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924],
    b: [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857],
    c: [
      -0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497,
      2.93816398269878,
    ],
    d: [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742],
  };
  const low = 0.02425;
  const high = 1 - low;
  let result: number;
  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    result =
      (((((coefficients.c[0]! * q + coefficients.c[1]!) * q + coefficients.c[2]!) * q + coefficients.c[3]!) * q +
        coefficients.c[4]!) *
        q +
        coefficients.c[5]!) /
      ((((coefficients.d[0]! * q + coefficients.d[1]!) * q + coefficients.d[2]!) * q + coefficients.d[3]!) * q + 1);
  } else if (probability > high) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    result =
      -(
        ((((coefficients.c[0]! * q + coefficients.c[1]!) * q + coefficients.c[2]!) * q + coefficients.c[3]!) * q +
          coefficients.c[4]!) *
          q +
        coefficients.c[5]!
      ) /
      ((((coefficients.d[0]! * q + coefficients.d[1]!) * q + coefficients.d[2]!) * q + coefficients.d[3]!) * q + 1);
  } else {
    const q = probability - 0.5;
    const r = q * q;
    result =
      ((((((coefficients.a[0]! * r + coefficients.a[1]!) * r + coefficients.a[2]!) * r + coefficients.a[3]!) * r +
        coefficients.a[4]!) *
        r +
        coefficients.a[5]!) *
        q) /
      (((((coefficients.b[0]! * r + coefficients.b[1]!) * r + coefficients.b[2]!) * r + coefficients.b[3]!) * r +
        coefficients.b[4]!) *
        r +
        1);
  }
  for (let index = 0; index < 3; index++) {
    const correction = (normalCdf(result) - probability) / normalPdf(result);
    result -= correction;
  }
  return result;
}

function inverseCdf(cdf: (value: number) => number, probability: number, lower = -10, upper = 10): NumResult {
  if (!(probability > 0 && probability < 1)) return numberError();
  const increasing = cdf(upper) >= cdf(lower);
  if (increasing) {
    while (cdf(lower) > probability) lower = lower === 0 ? -1 : lower * 2;
    while (cdf(upper) < probability) upper = upper === 0 ? 1 : upper * 2;
  } else {
    while (cdf(lower) < probability) lower = lower === 0 ? -1 : lower * 2;
    while (cdf(upper) > probability) upper = upper === 0 ? 1 : upper * 2;
  }
  for (let index = 0; index < 1100; index++) {
    const middle = (lower + upper) / 2;
    if (middle === lower || middle === upper) break;
    const value = cdf(middle);
    if (increasing ? value < probability : value > probability) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

function betaPdf(x: number, a: number, b: number): NumResult {
  if (x < 0 || x > 1 || a <= 0 || b <= 0) return numberError();
  if (x === 0) return a < 1 ? numberError() : a === 1 ? b : 0;
  if (x === 1) return b < 1 ? numberError() : b === 1 ? a : 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - betaLog(a, b));
}

function gammaPdf(x: number, alpha: number, beta: number): NumResult {
  if (x < 0 || alpha <= 0 || beta <= 0) return numberError();
  if (x === 0) return alpha === 1 ? 1 / beta : alpha < 1 ? numberError() : 0;
  return Math.exp((alpha - 1) * Math.log(x) - x / beta - logGamma(alpha) - alpha * Math.log(beta));
}

function gammaCdf(x: number, alpha: number, beta: number): NumResult {
  if (x < 0 || alpha <= 0 || beta <= 0) return numberError();
  return regularizedGammaP(alpha, x / beta);
}

function binomialPmf(successes: number, trials: number, probability: number): NumResult {
  if (
    !Number.isInteger(successes) ||
    !Number.isInteger(trials) ||
    successes < 0 ||
    trials < 0 ||
    successes > trials ||
    probability < 0 ||
    probability > 1
  )
    return numberError();
  if (probability === 0) return successes === 0 ? 1 : 0;
  if (probability === 1) return successes === trials ? 1 : 0;
  return Math.exp(
    logGamma(trials + 1) -
      logGamma(successes + 1) -
      logGamma(trials - successes + 1) +
      successes * Math.log(probability) +
      (trials - successes) * Math.log1p(-probability),
  );
}

function binomialCdf(successes: number, trials: number, probability: number): NumResult {
  if (successes < 0) return 0;
  if (successes >= trials) return 1;
  return regularizedBeta(1 - probability, trials - successes, successes + 1);
}

function chiSquarePdf(value: number, df: number): NumResult {
  if (value < 0 || df <= 0) return numberError();
  if (value === 0) return df < 2 ? numberError() : df === 2 ? 0.5 : 0;
  const density = Math.exp((df / 2 - 1) * Math.log(value) - value / 2 - (df / 2) * Math.log(2) - logGamma(df / 2));
  return Number.isFinite(density) ? density : numberError();
}

function chiSquareCdf(value: number, df: number): NumResult {
  if (value < 0 || df <= 0) return numberError();
  return regularizedGammaP(df / 2, value / 2);
}

function chiSquareRightTail(value: number, df: number): NumResult {
  if (value < 0 || df <= 0) return numberError();
  return regularizedGammaQ(df / 2, value / 2);
}

function studentTCdf(value: number, df: number): NumResult {
  if (df <= 0) return numberError();
  if (value === 0) return 0.5;
  const x = df / (df + value * value);
  const tail = 0.5 * regularizedBeta(x, df / 2, 0.5);
  return value > 0 ? 1 - tail : tail;
}

function studentTRightTail(value: number, df: number): NumResult {
  if (df <= 0) return numberError();
  const x = df / (df + value * value);
  const tail = 0.5 * regularizedBeta(x, df / 2, 0.5);
  return value >= 0 ? tail : 1 - tail;
}

function studentTPdf(value: number, df: number): NumResult {
  if (df <= 0) return numberError();
  return (
    (Math.exp(logGamma((df + 1) / 2) - logGamma(df / 2)) / Math.sqrt(df * Math.PI)) *
    (1 + (value * value) / df) ** (-(df + 1) / 2)
  );
}

function fCdf(value: number, df1: number, df2: number): NumResult {
  if (value < 0 || df1 <= 0 || df2 <= 0) return numberError();
  if (value >= 1) return 1 - (fRightTail(value, df1, df2) as number);
  return regularizedBeta((df1 * value) / (df1 * value + df2), df1 / 2, df2 / 2);
}

function fRightTail(value: number, df1: number, df2: number): NumResult {
  if (value < 0 || df1 <= 0 || df2 <= 0) return numberError();
  const ratio = df2 / df1 / value;
  const fraction = value >= 1 ? ratio / (1 + ratio) : df2 / (df1 * value + df2);
  return regularizedBeta(fraction, df2 / 2, df1 / 2);
}

function fPdf(value: number, df1: number, df2: number): NumResult {
  if (value < 0 || df1 <= 0 || df2 <= 0) return numberError();
  if (value === 0) return df1 < 2 ? numberError() : df1 === 2 ? 1 : 0;
  const density = Math.exp(
    (df1 / 2 - 1) * Math.log(value) +
      (df2 / 2) * Math.log(df2) -
      ((df1 + df2) / 2) * Math.log(df1 * value + df2) +
      (df1 / 2) * Math.log(df1) -
      betaLog(df1 / 2, df2 / 2),
  );
  return Number.isFinite(density) ? density : numberError();
}

function arrays(args: FormulaArg[], context: EvalContext): any {
  const result: number[][] = [];
  for (const arg of args) {
    const matrix = matrixFromArg(arg, context);
    if (isError(matrix)) return matrix;
    const values: number[] = [];
    for (const row of matrix)
      for (const value of row) {
        if (isError(value)) return value;
        if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
      }
    result.push(values);
  }
  return result;
}

function numericMatrixFromArg(arg: FormulaArg, context: EvalContext): Array<Array<number | undefined>> | FormulaError {
  const matrix = matrixFromArg(arg, context);
  if (isError(matrix)) return matrix;
  const result: Array<Array<number | undefined>> = [];
  for (const row of matrix) {
    const numericRow: Array<number | undefined> = [];
    for (const value of row) {
      if (isError(value)) return value;
      numericRow.push(typeof value === 'number' && Number.isFinite(value) ? value : undefined);
    }
    result.push(numericRow);
  }
  return result;
}

function linearRegression(
  x: number[],
  y: number[],
  includeConstant = true,
): { slope: number; intercept: number } | FormulaError {
  if (x.length !== y.length || x.length < 2) return divisionError();
  if (!includeConstant) {
    const xScale = x.reduce((scale, value) => Math.max(scale, Math.abs(value)), 0);
    const yScale = y.reduce((scale, value) => Math.max(scale, Math.abs(value)), 0);
    if (xScale === 0) return divisionError();
    let denominator = 0;
    let numerator = 0;
    for (let index = 0; index < x.length; index++) {
      const scaledX = x[index]! / xScale;
      denominator += scaledX * scaledX;
      if (yScale !== 0) numerator += scaledX * (y[index]! / yScale);
    }
    return { slope: yScale === 0 ? 0 : (numerator / denominator) * (yScale / xScale), intercept: 0 };
  }
  const exact = exactIntegerRegression(x, y);
  if (exact) return exact;
  const xMean = x.reduce((sum, value) => sum + value, 0) / x.length;
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length;
  const xScale = x.reduce((scale, value) => Math.max(scale, Math.abs(value - xMean)), 0);
  const yScale = y.reduce((scale, value) => Math.max(scale, Math.abs(value - yMean)), 0);
  if (xScale === 0) return divisionError();
  let denominator = 0;
  let numerator = 0;
  for (let index = 0; index < x.length; index++) {
    const xDeviation = (x[index]! - xMean) / xScale;
    const yDeviation = yScale === 0 ? 0 : (y[index]! - yMean) / yScale;
    denominator += xDeviation * xDeviation;
    numerator += xDeviation * yDeviation;
  }
  const slope = yScale === 0 ? 0 : (numerator / denominator) * (yScale / xScale);
  return { slope, intercept: yMean - slope * xMean };
}

function exactIntegerRegression(x: number[], y: number[]): { slope: number; intercept: number } | undefined {
  if (!x.every(Number.isSafeInteger) || !y.every(Number.isSafeInteger)) return undefined;
  let sumX = 0n;
  let sumY = 0n;
  let sumXX = 0n;
  let sumXY = 0n;
  for (let index = 0; index < x.length; index++) {
    const xValue = BigInt(x[index]!);
    const yValue = BigInt(y[index]!);
    sumX += xValue;
    sumY += yValue;
    sumXX += xValue * xValue;
    sumXY += xValue * yValue;
  }
  const count = BigInt(x.length);
  const denominator = count * sumXX - sumX * sumX;
  if (denominator === 0n) return undefined;
  const slopeNumerator = count * sumXY - sumX * sumY;
  const interceptNumerator = sumY * denominator - slopeNumerator * sumX;
  const interceptDenominator = count * denominator;
  if (slopeNumerator % denominator !== 0n) return undefined;
  const slope = Number(slopeNumerator / denominator);
  const intercept = Number(interceptNumerator) / Number(interceptDenominator);
  return Number.isSafeInteger(slope) && Number.isFinite(intercept) ? { slope, intercept } : undefined;
}

function regressionDetails(coefficients: number[], statistics: RegressionStatistics): FormulaValue[][] {
  const unavailable = () => notAvailable();
  const finite = (value: number) => (Number.isFinite(value) ? value : numberError());
  const padded = (first: FormulaValue, second: FormulaValue) => [
    first,
    second,
    ...Array.from({ length: coefficients.length - 2 }, unavailable),
  ];
  return [
    coefficients,
    statistics.standardErrors.map((value) => (Number.isFinite(value) ? value : unavailable())),
    padded(finite(statistics.rSquared), finite(statistics.standardErrorY)),
    padded(finite(statistics.fStatistic), statistics.degreesOfFreedom),
    padded(finite(statistics.regressionSumSquares), finite(statistics.residualSumSquares)),
  ];
}

function criteriaValues(arg: FormulaArg, context: EvalContext): CellEntry[] | FormulaError {
  return entriesForArg(arg, context);
}

function expandedAverageIfEntries(args: FormulaArg[], context: EvalContext): CellEntry[] | FormulaError | undefined {
  const selectedRange = resolveConditionalReference(args[2], context);
  const criteriaRange = resolveConditionalReference(args[0], context);
  if (isError(selectedRange)) return selectedRange;
  if (isError(criteriaRange)) return criteriaRange;
  if (!selectedRange || !criteriaRange) return undefined;
  const expandedRange = {
    ...selectedRange,
    endRow: selectedRange.startRow + criteriaRange.endRow - criteriaRange.startRow,
    endCol: selectedRange.startCol + criteriaRange.endCol - criteriaRange.startCol,
  };
  const entries: CellEntry[] = [];
  const error = forEachFormulaRangeCellWithMetadata(expandedRange, context, (cell) => {
    entries.push({ value: cell.value, cell });
  });
  return error ?? entries;
}

function conditionalValues(
  args: FormulaArg[],
  context: EvalContext,
  selectedIndex: number,
  mode: 'sum' | 'average' | 'count' | 'max' | 'min',
  requireMatchingLengths = false,
  selectedOverride?: CellEntry[],
): FormulaValue {
  const selected = selectedOverride ?? criteriaValues(args[selectedIndex]!, context);
  if (isError(selected)) return selected;
  const pairs: Array<{ entries: CellEntry[]; criterion: FormulaValue }> = [];
  for (let index = selectedIndex + 1; index < args.length; index += 2) {
    const values = criteriaValues(args[index]!, context);
    if (isError(values)) return values;
    if (requireMatchingLengths && values.length !== selected.length) return valueError();
    const criterion = readArg(args[index + 1]!, context);
    if (Array.isArray(criterion)) return valueError();
    if (isError(criterion) && mode !== 'count') {
      const reference = resolveConditionalReference(args[index + 1], context);
      if (!reference || isError(reference)) return criterion;
    }
    pairs.push({ entries: values, criterion });
  }
  const selectedValues: number[] = [];
  for (let index = 0; index < selected.length; index++) {
    let matches = true;
    for (const pair of pairs) {
      const entry = pair.entries[index];
      if (!matchesCriteria(entry?.value ?? 0, pair.criterion, entry?.cell?.source)) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    if (mode !== 'count' && isError(selected[index]!.value)) return selected[index]!.value;
    const numeric = numericCell(selected[index]!.value);
    if (mode === 'count') {
      selectedValues.push(1);
    } else if (numeric !== undefined) selectedValues.push(numeric);
  }
  if (mode === 'count') return selectedValues.length;
  if (selectedValues.length === 0) return mode === 'average' ? divisionError() : 0;
  if (mode === 'sum') return selectedValues.reduce((sum, value) => sum + value, 0);
  if (mode === 'average') return mean(selectedValues);
  return mode === 'max' ? Math.max(...selectedValues) : Math.min(...selectedValues);
}

function evaluateStatistics(name: string, args: FormulaArg[], context: EvalContext): FormulaValue {
  const countError = (min: number, max = Number.POSITIVE_INFINITY) => checkCount(args, min, max);
  const unary = (operation: (value: number) => NumResult): FormulaValue => {
    const count = countError(1, 1);
    if (count) return count;
    const value = readNumber(args, 0, context);
    return isError(value) ? value : operation(value);
  };
  const numeric = (options: { directBooleans?: boolean; directText?: boolean } = {}): number[] | FormulaError =>
    numericValues(args, context, options);

  switch (name) {
    case 'AVEDEV': {
      if (args.length === 0) return valueError();
      const values = deviationValues(args, context);
      if (isError(values)) return values;
      if (values.length === 0) return numberError();
      const average = mean(values);
      return isError(average)
        ? average
        : values.reduce((sum, value) => sum + Math.abs(value - average), 0) / values.length;
    }
    case 'AVERAGEA': {
      const cells = allValues(args, context);
      if (isError(cells)) return cells;
      const values: number[] = [];
      for (const entry of cells) {
        const value = aSeriesNumber(entry, context);
        if (isError(value)) return value;
        if (value !== undefined) values.push(value);
      }
      return mean(values);
    }
    case 'AVERAGEIF': {
      if (args.length < 2 || args.length > 3) return valueError();
      const expanded = args.length === 3 ? expandedAverageIfEntries(args, context) : undefined;
      if (isError(expanded)) return expanded;
      return conditionalValues(
        args.length === 3 ? [args[2]!, args[0]!, args[1]!] : [args[0]!, args[0]!, args[1]!],
        context,
        0,
        'average',
        false,
        expanded,
      );
    }
    case 'AVERAGEIFS':
      if (args.length < 3 || args.length % 2 === 0) return valueError();
      return conditionalValues(args, context, 0, 'average', true);
    case 'COUNT':
      return (() => {
        const cells = allValues(args, context);
        if (isError(cells)) return cells;
        let total = 0;
        for (const entry of cells) {
          if (entry.cell && numericCell(entry.value) !== undefined) total++;
          else if (!entry.cell && (typeof entry.value === 'number' || typeof entry.value === 'boolean')) total++;
        }
        return total;
      })();
    case 'COUNTA': {
      const cells = allValues(args, context);
      if (isError(cells)) return cells;
      return cells.reduce((total, entry) => total + (entry.cell?.source === 'empty' ? 0 : 1), 0);
    }
    case 'COUNTBLANK': {
      if (args.length !== 1) return valueError();
      const cells = entriesForArg(args[0]!, context);
      if (isError(cells)) return cells;
      return cells.reduce((total, entry) => total + (isBlankEntry(entry) ? 1 : 0), 0);
    }
    case 'COUNTIF':
      if (args.length !== 2) return valueError();
      return conditionalValues([args[0]!, args[0]!, args[1]!], context, 0, 'count');
    case 'COUNTIFS':
      if (args.length < 2 || args.length % 2 !== 0) return valueError();
      return conditionalValues([args[0]!, args[0]!, ...args.slice(1)], context, 0, 'count', true);
    case 'DEVSQ': {
      if (args.length === 0) return valueError();
      const values = deviationValues(args, context);
      if (isError(values)) return values;
      if (values.length === 0) return numberError();
      const average = mean(values);
      return isError(average) ? average : values.reduce((sum, value) => sum + (value - average) ** 2, 0);
    }
    case 'GEOMEAN': {
      const values = deviationValues(args, context);
      if (isError(values)) return values;
      if (values.length === 0 || values.some((value) => value <= 0)) return numberError();
      if (values.length === 1) return values[0]!;
      return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
    }
    case 'HARMEAN': {
      const values = deviationValues(args, context);
      if (isError(values)) return values;
      if (values.length === 0) {
        const reference = args.length === 1 ? resolveConditionalReference(args[0], context) : undefined;
        if (
          reference &&
          !isError(reference) &&
          reference.startRow === reference.endRow &&
          reference.startCol === reference.endCol
        )
          return error(FormulaErrorCode.NotAvailable);
        return numberError();
      }
      if (values.some((value) => value <= 0)) return numberError();
      if (values.length === 1) return values[0]!;
      const minimum = values.reduce((current, value) => Math.min(current, value), Infinity);
      return minimum * (values.length / values.reduce((sum, value) => sum + minimum / value, 0));
    }
    case 'KURT': {
      const values = deviationValues(args, context);
      if (isError(values)) return values;
      if (values.length < 4) return divisionError();
      const n = values.length;
      const moments = standardizedCentralMoments(values);
      if (moments.second === 0) return divisionError();
      const sampleVariance = moments.second / (n - 1);
      const standardizedFourth = moments.fourth / sampleVariance ** 2;
      return (
        (n * (n + 1) * standardizedFourth) / ((n - 1) * (n - 2) * (n - 3)) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
      );
    }
    case 'MAX':
    case 'MIN': {
      const values = deviationValues(args, context);
      if (isError(values)) return values;
      if (values.length === 0) return 0;
      return name === 'MAX' ? Math.max(...values) : Math.min(...values);
    }
    case 'MAXA':
    case 'MINA': {
      const cells = allValues(args, context);
      if (isError(cells)) return cells;
      const values: number[] = [];
      for (const entry of cells) {
        const value = aSeriesNumber(entry, context);
        if (isError(value)) return value;
        if (value !== undefined) values.push(value);
      }
      return values.length === 0 ? 0 : name === 'MAXA' ? Math.max(...values) : Math.min(...values);
    }
    case 'MAXIFS':
      if (args.length < 3 || args.length % 2 === 0) return valueError();
      return conditionalValues(args, context, 0, 'max', true);
    case 'MINIFS':
      if (args.length < 3 || args.length % 2 === 0) return valueError();
      return conditionalValues(args, context, 0, 'min', true);
    case 'MEDIAN': {
      const values = deviationValues(args, context);
      if (isError(values)) return values;
      if (values.length === 0) return numberError();
      const ordered = sorted(values);
      const middle = Math.floor(ordered.length / 2);
      return ordered.length % 2 ? ordered[middle]! : interpolate(ordered[middle - 1]!, ordered[middle]!, 0.5);
    }
    case 'MODE.SNGL':
    case 'MODE.MULT': {
      if (args.some((arg) => isBlankScalarInput(arg, context))) return valueError();
      const values = numeric();
      if (isError(values)) return values;
      if (values.length === 0) return notAvailable();
      const counts = new Map<number, number>();
      values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
      const highest = Math.max(...counts.values());
      if (highest < 2) return notAvailable();
      const modes = [...counts.entries()]
        .filter(([, count]) => count === highest)
        .map(([value]) => value)
        .sort((a, b) => a - b);
      return name === 'MODE.MULT' ? modes.map((value) => [value]) : modes[0]!;
    }
    case 'LARGE':
    case 'SMALL': {
      if (args.length !== 2) return valueError();
      let values = numericValues([args[0]!], context);
      if (isError(values)) return values;
      const direct = directStatisticalNumber(args[0]!, context);
      if (isError(direct)) return direct;
      if (direct !== undefined) values = [direct];
      const k = readNumber(args, 1, context);
      if (isError(k)) return k;
      if (k < 1) return numberError();
      const rank = name === 'LARGE' ? Math.ceil(k) : Math.trunc(k);
      if (rank < 1 || rank > values.length) return numberError();
      const ordered = sorted(values);
      return name === 'LARGE' ? ordered[ordered.length - rank]! : ordered[rank - 1]!;
    }
    case 'PERCENTILE.EXC':
    case 'PERCENTILE.INC':
    case 'QUARTILE.EXC':
    case 'QUARTILE.INC': {
      if (args.length !== 2) return valueError();
      const isQuartile = name.startsWith('QUARTILE');
      if (
        isQuartile &&
        args[0]?.kind === 'value' &&
        args[0].sourceKind === FormulaNodeKind.String &&
        typeof args[0].value === 'string' &&
        Number.isNaN(Number(args[0].value)) &&
        numericDateText(args[0].value, context) !== undefined
      )
        return numberError();
      const direct = directStatisticalNumber(args[0]!, context);
      if (isError(direct)) return direct;
      const values = isBlankScalarInput(args[0]!, context)
        ? []
        : direct === undefined
        ? numericValues([args[0]!], context)
        : [direct];
      if (isError(values)) return values;
      const parameter = readNumber(args, 1, context);
      if (isError(parameter)) return parameter;
      if (isQuartile && parameter < 0) return numberError();
      const k = isQuartile ? Math.trunc(parameter) / 4 : parameter;
      return percentile(values, k, name.endsWith('.EXC'));
    }
    case 'PERCENTRANK.EXC':
    case 'PERCENTRANK.INC': {
      if (args.length < 2 || args.length > 3) return valueError();
      const direct = directStatisticalNumber(args[0]!, context);
      if (isError(direct)) return direct;
      const values = direct === undefined ? numericValues([args[0]!], context) : [direct];
      if (isError(values)) return values;
      const target = readNumber(args, 1, context);
      if (isError(target)) return target;
      const significance = readNumber(args, 2, context, 3);
      if (isError(significance)) return significance;
      if (significance < 1 || significance > 32767) return numberError();
      const ordered = sorted(values);
      if (ordered.length === 0) return notAvailable();
      if (target < ordered[0]! || target > ordered[ordered.length - 1]!) return notAvailable();
      if (name === 'PERCENTRANK.INC' && ordered.length === 1) return numberError();
      for (let index = 0; index < ordered.length; index++) {
        if (target === ordered[index]) {
          const rank = name.endsWith('.EXC') ? (index + 1) / (ordered.length + 1) : index / (ordered.length - 1);
          return truncateTo(rank, significance);
        }
        if (target < ordered[index]!) {
          const lower = ordered[index - 1]!;
          const upper = ordered[index]!;
          const difference = upper - lower;
          const scale = Math.max(Math.abs(lower), Math.abs(upper), Math.abs(target));
          const fraction = Number.isFinite(difference)
            ? (target - lower) / difference
            : (target / scale - lower / scale) / (upper / scale - lower / scale);
          const base = name.endsWith('.EXC')
            ? (index + fraction) / (ordered.length + 1)
            : (index - 1 + fraction) / (ordered.length - 1);
          return truncateTo(base, significance);
        }
      }
      return 0;
    }
    case 'RANK.EQ':
    case 'RANK.AVG': {
      if (args.length < 2 || args.length > 3) return valueError();
      const target = readNumber(args, 0, context);
      if (isError(target)) return target;
      const values = numericValues([args[1]!], context);
      if (isError(values)) return values;
      let order: number | FormulaError = 0;
      if (args[2] && args[2].kind !== 'missing') {
        const raw = readArg(args[2], context);
        if (isError(raw)) return raw;
        const text = isFormulaText(raw) ? raw.value : raw;
        if (typeof text === 'string') {
          const normalized = text.trim();
          order = /^true$/i.test(normalized)
            ? 1
            : /^false$/i.test(normalized)
            ? 0
            : /^[+-]?\d+$/.test(normalized)
            ? Number(normalized)
            : valueError();
        } else if (typeof text === 'number') order = text;
        else if (typeof text === 'boolean') order = Number(text);
        else order = readNumber(args, 2, context);
      }
      if (isError(order)) return order;
      if (values.length === 0) return notAvailable();
      const descending = order === 0;
      const betterCount = values.filter((value) => (descending ? value > target : value < target)).length;
      const equalCount = values.filter((value) => value === target).length;
      if (equalCount === 0) return notAvailable();
      const rank = betterCount + 1;
      return name === 'RANK.AVG' && equalCount > 1 ? rank + (equalCount - 1) / 2 : rank;
    }
    case 'TRIMMEAN': {
      if (args.length !== 2) return valueError();
      if (isBlankScalarInput(args[0]!, context)) return numberError();
      const direct = directStatisticalNumber(args[0]!, context);
      if (isError(direct)) return direct;
      const values = direct === undefined ? numericValues([args[0]!], context) : [direct];
      if (isError(values)) return values;
      const proportion = readNumber(args, 1, context);
      if (isError(proportion)) return proportion;
      if (proportion < 0 || proportion >= 1) return numberError();
      if (values.length === 0) return numberError();
      let trim = Math.floor(values.length * proportion);
      if (trim % 2 !== 0) trim--;
      return mean(sorted(values).slice(trim / 2, values.length - trim / 2));
    }
    case 'STDEV.P':
    case 'STDEV.S': {
      const values = deviationValues(args, context);
      return isError(values) ? values : standardDeviation(values, name.endsWith('.S'));
    }
    case 'VAR.P':
    case 'VAR.S':
    case 'VAR': {
      const values = deviationValues(args, context);
      return isError(values) ? values : variance(values, name === 'VAR.S' || name === 'VAR');
    }
    case 'STDEVA':
    case 'STDEVPA':
    case 'VARA':
    case 'VARPA': {
      const values: number[] = [];
      for (const arg of args) {
        if (isBlankScalarInput(arg, context)) continue;
        const cells = entriesForArg(arg, context);
        if (isError(cells)) return cells;
        for (const entry of cells) {
          const value = aSeriesNumber(entry, context);
          if (isError(value)) return value;
          if (value !== undefined) values.push(value);
        }
      }
      const sample = name === 'STDEVA' || name === 'VARA';
      return name.startsWith('STDEV') ? standardDeviation(values, sample) : variance(values, sample);
    }
    case 'SKEW':
    case 'SKEW.P': {
      const values = deviationValues(args, context);
      if (isError(values)) return values;
      if (values.length < 3) return divisionError();
      const { second: m2, third: m3 } = standardizedCentralMoments(values);
      if (m2 === 0) return divisionError();
      return name === 'SKEW.P'
        ? m3 / values.length / (m2 / values.length) ** 1.5
        : (values.length * m3) / ((values.length - 1) * (values.length - 2) * (m2 / (values.length - 1)) ** 1.5);
    }
    case 'FREQUENCY': {
      if (args.length !== 2) return valueError();
      const dataArg = args[0]!;
      if (
        dataArg.kind === 'value' &&
        (dataArg.sourceKind === FormulaNodeKind.String || dataArg.sourceKind === FormulaNodeKind.Boolean)
      )
        return valueError();
      const data = isBlankScalarInput(args[0]!, context) ? [] : numericValues([args[0]!], context);
      const binReference = resolveConditionalReference(args[1]!, context);
      if (isError(binReference)) return binReference;
      const binEntries = binReference ? entriesForArg(args[1]!, context) : undefined;
      if (isError(binEntries)) return binEntries;
      const binArg = args[1]!;
      if (
        !binEntries &&
        binArg.kind === 'value' &&
        (binArg.sourceKind === FormulaNodeKind.String || binArg.sourceKind === FormulaNodeKind.Boolean)
      )
        return valueError();
      const bins = binEntries
        ? binEntries
            .filter((entry) => !isBlankEntry(entry))
            .map((entry) =>
              isError(entry.value)
                ? entry.value
                : binEntries.length > 1 && typeof entry.value === 'boolean'
                ? undefined
                : numericCell(entry.value) ?? 0,
            )
        : numericValues([args[1]!], context);
      if (isError(data)) return data;
      if (isError(bins)) return bins;
      const binError = bins.find(isError);
      if (binError) return binError;
      const orderedBins = bins
        .map((value, index) => ({ value, index }))
        .filter((bin) => bin.value !== undefined)
        .sort((left, right) => left.value - right.value || left.index - right.index);
      const counts = Array(bins.length).fill(0);
      orderedBins.forEach((bin, index) => {
        counts[bin.index] = data.filter(
          (value) => value <= bin.value && (index === 0 || value > orderedBins[index - 1]!.value),
        ).length;
      });
      counts.push(
        orderedBins.length === 0
          ? data.length
          : data.filter((value) => value > orderedBins[orderedBins.length - 1]!.value).length,
      );
      return counts.map((value) => [value]);
    }
    case 'COVARIANCE.P':
    case 'COVARIANCE.S': {
      if (expressionScalarAgainstRange(args, context)) return valueError();
      const pair = pairValues([args[1]!, args[0]!], context);
      if (isError(pair)) return pair;
      const [x, y] = pair;
      if (x.length < (name.endsWith('.S') ? 2 : 1)) return divisionError();
      const xMean = mean(x) as number;
      const yMean = mean(y) as number;
      const divisor = x.length - (name.endsWith('.S') ? 1 : 0);
      return x.reduce((sum, value, index) => sum + ((value - xMean) / divisor) * (y[index]! - yMean), 0);
    }
    case 'CORREL':
    case 'PEARSON': {
      const pair = pairValues([args[1]!, args[0]!], context);
      if (isError(pair)) return pair;
      const [x, y] = pair;
      if (x.length < 2) return divisionError();
      const xMean = x.reduce((sum, value) => sum + value, 0) / x.length;
      const yMean = y.reduce((sum, value) => sum + value, 0) / y.length;
      const xScale = x.reduce((scale, value) => Math.max(scale, Math.abs(value - xMean)), 0);
      const yScale = y.reduce((scale, value) => Math.max(scale, Math.abs(value - yMean)), 0);
      if (xScale === 0 || yScale === 0) return divisionError();
      let numerator = 0;
      let xSquares = 0;
      let ySquares = 0;
      for (let index = 0; index < x.length; index++) {
        const xDeviation = (x[index]! - xMean) / xScale;
        const yDeviation = (y[index]! - yMean) / yScale;
        numerator += xDeviation * yDeviation;
        xSquares += xDeviation * xDeviation;
        ySquares += yDeviation * yDeviation;
      }
      return numerator / Math.sqrt(xSquares * ySquares);
    }
    case 'RSQ': {
      if (expressionScalarAgainstRange(args, context)) return valueError();
      const correlation = evaluateStatistics('CORREL', args, context);
      return isError(correlation) ? correlation : correlation * correlation;
    }
    case 'SLOPE':
    case 'INTERCEPT':
    case 'STEYX':
    case 'FORECAST':
    case 'FORECAST.LINEAR': {
      if (name === 'FORECAST' || name === 'FORECAST.LINEAR') {
        if (args.length !== 3) return valueError();
        const target = readNumber(args, 0, context);
        const pair = pairValues([args[2]!, args[1]!], context);
        if (isError(target) || isError(pair)) return isError(target) ? target : pair;
        const model = linearRegression(pair[0], pair[1]);
        return isError(model) ? model : model.intercept + model.slope * target;
      }
      if (name === 'STEYX' && expressionScalarAgainstRange(args, context)) return valueError();
      const pair = pairValues([args[1]!, args[0]!], context);
      if (isError(pair)) return pair;
      if (name === 'STEYX' && pair[0].length <= 2) return divisionError();
      const model = linearRegression(pair[0], pair[1]);
      if (isError(model)) return model;
      if (name === 'SLOPE') return model.slope;
      if (name === 'INTERCEPT') return model.intercept;
      const residual = pair[1].reduce(
        (sum, value, index) => sum + (value - (model.intercept + model.slope * pair[0][index]!)) ** 2,
        0,
      );
      return Math.sqrt(residual / (pair[0].length - 2));
    }
    case 'GROWTH':
    case 'LOGEST':
    case 'LINEST':
    case 'TREND': {
      if (args.length < 1 || args.length > 4) return valueError();
      const constantIndex = name === 'LOGEST' || name === 'LINEST' ? 2 : 3;
      const constantArg = args[constantIndex];
      const includeConstant =
        constantArg && constantArg.kind !== 'missing' ? readBoolean(args, constantIndex, context) : true;
      if (isError(includeConstant)) return valueError();
      const includeStatistics =
        (name === 'LINEST' || name === 'LOGEST') && args[3] && args[3].kind !== 'missing'
          ? readBoolean(args, 3, context)
          : false;
      if (isError(includeStatistics)) return valueError();
      const knownXArg = args[1];
      if (
        (name === 'LINEST' || name === 'LOGEST') &&
        knownXArg?.kind === 'value' &&
        (knownXArg.sourceKind === FormulaNodeKind.Boolean || knownXArg.sourceKind === FormulaNodeKind.String) &&
        knownXArg.sourceAst?.kind !== FormulaNodeKind.Call
      )
        return valueError();
      const yShape = regressionInputShape(args[0]!, context);
      if (isError(yShape)) return yShape;
      const hasKnownX = args[1] && args[1].kind !== 'missing';
      const xShape = hasKnownX ? regressionInputShape(args[1]!, context) : yShape;
      if (isError(xShape)) return xShape;
      const verticalMultipleX = yShape[0] > 1 && yShape[1] === 1 && xShape[0] === yShape[0] && xShape[1] > 1;
      const horizontalMultipleX = yShape[1] > 1 && yShape[0] === 1 && xShape[1] === yShape[1] && xShape[0] > 1;
      if (verticalMultipleX || horizontalMultipleX) {
        const yMatrix = numericMatrixFromArg(args[0]!, context);
        const xMatrix = numericMatrixFromArg(args[1]!, context);
        if (isError(yMatrix)) return yMatrix;
        if (isError(xMatrix)) return xMatrix;
        const yValues = yMatrix.flat();
        if (
          yValues.some((value) => value === undefined) ||
          xMatrix.some((row) => row.some((value) => value === undefined))
        )
          return valueError();
        const predictors = verticalMultipleX
          ? (xMatrix as number[][])
          : (Array.from({ length: yValues.length }, (_, index) => xMatrix.map((row) => row[index]!)) as number[][]);
        const exponential = name === 'GROWTH' || name === 'LOGEST';
        if (exponential && yValues.some((value) => value! <= 0)) return numberError();
        const model = multipleRegression(
          predictors,
          exponential ? (yValues as number[]).map(Math.log) : (yValues as number[]),
          includeConstant,
          includeStatistics,
        );
        if (!model) return divisionError();
        if (name === 'LINEST' || name === 'LOGEST') {
          const coefficients = [...model.coefficients].reverse().concat(model.intercept);
          const output = name === 'LOGEST' ? coefficients.map(Math.exp) : coefficients;
          return includeStatistics ? regressionDetails(output, model.statistics!) : [output];
        }
        const predictionMatrix =
          args[2] && args[2].kind !== 'missing' ? numericMatrixFromArg(args[2]!, context) : xMatrix;
        if (isError(predictionMatrix)) return valueError();
        const predictorCount = model.coefficients.length;
        const predictionRows = verticalMultipleX
          ? (predictionMatrix as number[][])
          : Array.from({ length: predictionMatrix[0]?.length ?? 0 }, (_, index) =>
              predictionMatrix.map((row) => row[index]!),
            );
        if (
          !predictionRows.length ||
          predictionRows.some((row) => row.length !== predictorCount || row.some((value) => value === undefined))
        )
          return valueError();
        const predictions = predictionRows.map((row) => {
          const value = row.reduce(
            (sum, predictor, index) => sum + predictor * model.coefficients[index]!,
            model.intercept,
          );
          return exponential ? Math.exp(value) : value;
        });
        return horizontalMultipleX ? [predictions] : predictions.map((value) => [value]);
      }
      const scalarYWithMultipleX = regressionInputSize(yShape) === 1 && regressionInputSize(xShape) > 1;
      if (!scalarYWithMultipleX && !sameRegressionInputShape(yShape, xShape)) {
        if (
          (name === 'TREND' || name === 'GROWTH') &&
          knownXArg?.kind === 'value' &&
          (knownXArg.sourceKind === FormulaNodeKind.String || knownXArg.sourceKind === FormulaNodeKind.Boolean)
        )
          return valueError();
        return error(FormulaErrorCode.Reference);
      }
      if (isBlankScalarInput(args[0]!, context)) return valueError();
      const y = numericValues([args[0]!], context);
      if (isError(y)) return scalarYWithMultipleX ? valueError() : y;
      if (scalarYWithMultipleX && y.length === 0) return valueError();
      const x = hasKnownX ? numericValues([args[1]!], context) : y.map((_, index) => index + 1);
      if (isError(x)) return x;
      const exponential = name === 'GROWTH' || name === 'LOGEST';
      if (y.length > 1 && x.length === 1) return error(FormulaErrorCode.Reference);
      if (y.length === 0 && x.length > 1) return valueError();
      if ((name === 'LOGEST' || name === 'LINEST') && !scalarYWithMultipleX && y.length !== x.length)
        return valueError();
      if ((name === 'TREND' || name === 'GROWTH') && y.length > 1 && y.length !== x.length)
        return hasKnownX && x.length < regressionInputSize(xShape) ? valueError() : error(FormulaErrorCode.Reference);
      if (exponential && y.some((value) => value <= 0)) return numberError();
      if ((name === 'TREND' || name === 'GROWTH') && y.length !== x.length) return error(FormulaErrorCode.Reference);
      const values = exponential ? y.map((value) => Math.log(value)) : y;
      const model =
        y.length === 1 && x.length > 1
          ? { slope: 0, intercept: values[0]! }
          : linearRegression(x, values, includeConstant);
      if (isError(model)) return model;
      if (name === 'LOGEST') {
        const coefficients = [model.slope, model.intercept].map((value) => {
          const exponential = Math.exp(value);
          const nearestInteger = Math.round(exponential);
          return Math.abs(exponential - nearestInteger) <= 2 * Number.EPSILON * Math.max(1, Math.abs(exponential))
            ? nearestInteger
            : exponential;
        });
        if (!includeStatistics) return [coefficients];
        const details = multipleRegression(
          x.map((value) => [value]),
          values,
          includeConstant,
          true,
        );
        return details ? regressionDetails(coefficients, details.statistics!) : divisionError();
      }
      if (name === 'LINEST') {
        const coefficients = [model.slope, model.intercept];
        if (!includeStatistics) return [coefficients];
        const details = multipleRegression(
          x.map((value) => [value]),
          values,
          includeConstant,
          true,
        );
        return details ? regressionDetails(coefficients, details.statistics!) : divisionError();
      }
      const newX = args[2] && args[2].kind !== 'missing' ? numericValues([args[2]!], context) : x;
      if (isError(newX) || newX.length === 0) return valueError();
      const predictions = newX.map((value) =>
        exponential ? Math.exp(model.intercept + model.slope * value) : model.intercept + model.slope * value,
      );
      if (args[2] && args[2].kind !== 'missing') {
        const predictionShape = regressionInputShape(args[2], context);
        if (isError(predictionShape)) return predictionShape;
        if (regressionInputSize(predictionShape) === predictions.length && predictionShape[1] > 1) {
          return Array.from({ length: predictionShape[0] }, (_, row) =>
            predictions.slice(row * predictionShape[1], (row + 1) * predictionShape[1]),
          );
        }
      }
      return predictions.map((value) => [value]);
    }
    case 'FISHER':
      return unary((value) => (value <= -1 || value >= 1 ? numberError() : Math.atanh(value)));
    case 'FISHERINV':
      return unary(Math.tanh);
    case 'GAMMA':
      return unary(gamma);
    case 'GAMMA.DIST': {
      if (args.length !== 4) return valueError();
      const x = readNumber(args, 0, context);
      const alpha = readNumber(args, 1, context);
      const beta = readNumber(args, 2, context);
      const cumulative = readBoolean(args, 3, context);
      if ([x, alpha, beta, cumulative].some(isError)) return [x, alpha, beta, cumulative].find(isError) as FormulaError;
      return cumulative ? gammaCdf(x, alpha, beta) : gammaPdf(x, alpha, beta);
    }
    case 'GAMMA.INV': {
      if (args.length !== 3) return valueError();
      const probability = readNumber(args, 0, context);
      const alpha = readNumber(args, 1, context);
      const beta = readNumber(args, 2, context);
      if ([probability, alpha, beta].some(isError)) return [probability, alpha, beta].find(isError) as FormulaError;
      if (alpha <= 0 || beta <= 0) return numberError();
      if (probability === 0) return 0;
      return inverseCdf((value) => gammaCdf(value, alpha, beta) as number, probability, 0, Math.max(1, alpha * beta));
    }
    case 'GAMMALN':
    case 'GAMMALN.PRECISE':
      return unary((value) => (value <= 0 ? numberError() : value === 1 || value === 2 ? 0 : logGamma(value)));
    case 'PHI':
      if (args.length !== 1) return error(FormulaErrorCode.Name);
      return unary(normalPdf);
    case 'GAUSS':
      if (args.length !== 1) return error(FormulaErrorCode.Name);
      return unary((value) => erf(value / Math.SQRT2) / 2);
    case 'NORM.DIST': {
      if (args.length !== 4) return valueError();
      const x = readNumber(args, 0, context);
      const meanValue = readNumber(args, 1, context);
      const deviation = readNumber(args, 2, context);
      const cumulative = readBoolean(args, 3, context);
      if (isError(x) || isError(meanValue) || isError(deviation) || isError(cumulative))
        return [x, meanValue, deviation, cumulative].find(isError) as FormulaError;
      if (deviation <= 0) return numberError();
      const standardized = standardize(x, meanValue, deviation);
      return cumulative ? normalCdf(standardized) : normalPdf(standardized) / deviation;
    }
    case 'NORM.S.DIST': {
      if (args.length !== 2) return valueError();
      const x = readNumber(args, 0, context);
      const cumulative = readBoolean(args, 1, context);
      if (isError(x) || isError(cumulative)) return isError(x) ? x : cumulative;
      if (Math.abs(x) >= 1e12) return numberError();
      return cumulative ? normalCdf(x) : normalPdf(x);
    }
    case 'NORM.S.INV':
      if (args.length !== 1) return valueError();
      return (() => {
        const p = readNumber(args, 0, context);
        return isError(p) ? p : normalInverse(p);
      })();
    case 'NORMINV': {
      if (args.length !== 3) return valueError();
      const p = readNumber(args, 0, context);
      const meanValue = readNumber(args, 1, context);
      const deviation = readNumber(args, 2, context);
      if (isError(p) || isError(meanValue) || isError(deviation))
        return [p, meanValue, deviation].find(isError) as FormulaError;
      const inverse = normalInverse(p);
      return isError(inverse) || deviation <= 0
        ? isError(inverse)
          ? inverse
          : numberError()
        : scaledNormalQuantile(meanValue, deviation, inverse);
    }
    case 'LOGNORM.DIST': {
      const x = readNumber(args, 0, context);
      const meanValue = readNumber(args, 1, context);
      const deviation = readNumber(args, 2, context);
      const cumulative = readBoolean(args, 3, context);
      if (isError(x) || isError(meanValue) || isError(deviation) || isError(cumulative))
        return [x, meanValue, deviation, cumulative].find(isError) as FormulaError;
      if (x <= 0 || deviation <= 0) return numberError();
      const z = (Math.log(x) - meanValue) / deviation;
      return cumulative ? normalCdf(z) : normalPdf(z) / (x * deviation);
    }
    case 'LOGNORM.INV': {
      if (args.length !== 3) return valueError();
      const p = readNumber(args, 0, context);
      const meanValue = readNumber(args, 1, context);
      const deviation = readNumber(args, 2, context);
      if (isError(p) || isError(meanValue) || isError(deviation))
        return [p, meanValue, deviation].find(isError) as FormulaError;
      const inverse = normalInverse(p);
      if (isError(inverse)) return inverse;
      if (deviation <= 0) return numberError();
      const result = Math.exp(meanValue + deviation * inverse);
      return Number.isFinite(result) ? result : numberError();
    }
    case 'EXPON.DIST': {
      const x = readNumber(args, 0, context);
      const lambda = readNumber(args, 1, context);
      const cumulative = readBoolean(args, 2, context);
      if (isError(x) || isError(lambda) || isError(cumulative))
        return [x, lambda, cumulative].find(isError) as FormulaError;
      if (x < 0 || lambda <= 0) return numberError();
      return cumulative ? -Math.expm1(-lambda * x) : lambda * Math.exp(-lambda * x);
    }
    case 'BETA.DIST': {
      const x = readNumber(args, 0, context);
      const a = readNumber(args, 1, context);
      const b = readNumber(args, 2, context);
      const cumulative = readBoolean(args, 3, context);
      const lower = readNumber(args, 4, context, 0);
      const upper = readNumber(args, 5, context, 1);
      if ([x, a, b, cumulative, lower, upper].some(isError))
        return [x, a, b, cumulative, lower, upper].find(isError) as FormulaError;
      if (a <= 0 || b <= 0 || upper <= lower || x < lower || x > upper) return numberError();
      const scaled = normalizeRangeValue(x, lower, upper);
      if (cumulative) return regularizedBeta(scaled, a, b);
      const density = betaPdf(scaled, a, b);
      return isError(density) ? density : density / (upper - lower);
    }
    case 'BETA.INV': {
      const p = readNumber(args, 0, context);
      const a = readNumber(args, 1, context);
      const b = readNumber(args, 2, context);
      const lower = readNumber(args, 3, context, 0);
      const upper = readNumber(args, 4, context, 1);
      if ([p, a, b, lower, upper].some(isError)) return [p, a, b, lower, upper].find(isError) as FormulaError;
      if (a <= 0 || b <= 0 || upper <= lower) return numberError();
      const inverse = p === 0.5 && a === b ? 0.5 : inverseCdf((value) => regularizedBeta(value, a, b), p, 0, 1);
      return isError(inverse) ? inverse : interpolateRange(lower, upper, inverse);
    }
    case 'BINOM.DIST': {
      const successes = readNumber(args, 0, context);
      const trials = readNumber(args, 1, context);
      const probability = readNumber(args, 2, context);
      const cumulative = readBoolean(args, 3, context);
      if ([successes, trials, probability, cumulative].some(isError))
        return [successes, trials, probability, cumulative].find(isError) as FormulaError;
      if (successes < 0 || trials < 0 || probability < 0 || probability > 1) return numberError();
      const wholeSuccesses = Math.trunc(successes);
      const wholeTrials = Math.trunc(trials);
      if (wholeSuccesses > wholeTrials) return numberError();
      return cumulative
        ? binomialCdf(wholeSuccesses, wholeTrials, probability)
        : binomialPmf(wholeSuccesses, wholeTrials, probability);
    }
    case 'BINOM.DIST.RANGE': {
      if (args.length > 4) return valueError();
      const trials = readNumber(args, 0, context);
      const probability = readNumber(args, 1, context);
      const lower = readNumber(args, 2, context);
      const upper = readNumber(args, 3, context, lower as number);
      if ([trials, probability, lower, upper].some(isError))
        return [trials, probability, lower, upper].find(isError) as FormulaError;
      if (trials < 0 || probability < 0 || probability > 1 || lower < 0 || upper < lower) return numberError();
      const wholeTrials = Math.trunc(trials);
      const wholeLower = Math.trunc(lower);
      const wholeUpper = Math.trunc(upper);
      if (wholeUpper > wholeTrials) return numberError();
      if (wholeLower === wholeUpper) {
        return binomialPmf(wholeLower, wholeTrials, probability);
      }
      const inclusive = binomialCdf(wholeUpper, wholeTrials, probability);
      const before = binomialCdf(wholeLower - 1, wholeTrials, probability);
      if (isError(inclusive)) return inclusive;
      if (isError(before)) return before;
      return Math.max(0, inclusive - before);
    }
    case 'BINOM.INV': {
      const trials = readNumber(args, 0, context);
      const probabilityArg = args[1];
      if (!probabilityArg || isFormulaArgumentKind(probabilityArg, 'missing')) return valueError();
      const probabilitySource = scalar(readArg(probabilityArg, context));
      if (isError(probabilitySource)) return probabilitySource;
      if (probabilitySource === '' || (isFormulaText(probabilitySource) && probabilitySource.value === ''))
        return valueError();
      const parsedProbability = toNumberOrError(probabilitySource);
      const probability = isError(parsedProbability)
        ? numericDateText(probabilitySource, context) ?? valueError()
        : parsedProbability;
      const alpha = readNumber(args, 2, context);
      if ([trials, probability, alpha].some(isError)) return [trials, probability, alpha].find(isError) as FormulaError;
      if (typeof probabilitySource !== 'number') return numberError();
      if (trials < 0 || trials >= 2_147_483_647 || probability <= 0 || probability > 1 || alpha < 0 || alpha >= 1)
        return numberError();
      const count = Math.trunc(trials);
      if (alpha === 0) return 0;
      if (probability === 1) return count;
      let low = 0;
      let high = count;
      while (low < high) {
        const mid = low + Math.floor((high - low) / 2);
        const cumulative = binomialCdf(mid, count, probability);
        if (isError(cumulative) || !Number.isFinite(cumulative)) return numberError();
        if (cumulative + 4 * Number.EPSILON * Math.max(cumulative, alpha) >= alpha) high = mid;
        else low = mid + 1;
      }
      return low;
    }
    case 'POISSON.DIST': {
      if (args[1]?.kind === FormulaNodeKind.Cell || args[1]?.kind === FormulaNodeKind.WorkbookCell) {
        const source = readArg(args[1], context);
        const text = isFormulaText(source) ? source.value : source;
        if (typeof text === 'string' && !Number.isFinite(Number(text))) return valueError();
      }
      const x = readNumber(args, 0, context);
      const meanValue = readNumber(args, 1, context);
      const cumulative = readBoolean(args, 2, context);
      if ([x, meanValue, cumulative].some(isError)) return [x, meanValue, cumulative].find(isError) as FormulaError;
      if (x < 0 || meanValue < 0) return numberError();
      const events = Math.trunc(x);
      if (meanValue === 0) return cumulative || events === 0 ? 1 : 0;
      const pmf = Math.exp(-meanValue + events * Math.log(meanValue) - logGamma(events + 1));
      if (!cumulative) return pmf;
      return regularizedGammaQ(events + 1, meanValue);
    }
    case 'NEGBINOM.DIST': {
      const failureInput = readNumber(args, 0, context);
      const successInput = readNumber(args, 1, context);
      const probability = readNumber(args, 2, context);
      const cumulative = readBoolean(args, 3, context);
      if ([failureInput, successInput, probability, cumulative].some(isError))
        return [failureInput, successInput, probability, cumulative].find(isError) as FormulaError;
      if (failureInput < 0) return numberError();
      const failures = Math.trunc(failureInput);
      const successes = Math.trunc(successInput);
      if (failures < 0 || successes <= 0 || probability <= 0 || probability > 1) return numberError();
      if (probability === 1) return cumulative || failures === 0 ? 1 : 0;
      const pmf = Math.exp(
        logGamma(failures + successes) -
          logGamma(successes) -
          logGamma(failures + 1) +
          successes * Math.log(probability) +
          failures * Math.log1p(-probability),
      );
      if (!cumulative) return pmf;
      let total = 0;
      for (let value = 0; value <= failures; value++)
        total += Math.exp(
          logGamma(value + successes) -
            logGamma(successes) -
            logGamma(value + 1) +
            successes * Math.log(probability) +
            value * Math.log1p(-probability),
        );
      return total;
    }
    case 'HYPGEOM.DIST': {
      if (args.length > 5) return valueError();
      const sampleValue = readNumber(args, 0, context);
      const sampleSizeValue = readNumber(args, 1, context);
      const populationSuccessValue = readNumber(args, 2, context);
      const populationValue = readNumber(args, 3, context);
      const cumulative = readBoolean(args, 4, context);
      if ([sampleValue, sampleSizeValue, populationSuccessValue, populationValue, cumulative].some(isError))
        return [sampleValue, sampleSizeValue, populationSuccessValue, populationValue, cumulative].find(
          isError,
        ) as FormulaError;
      if (
        ![sampleValue, sampleSizeValue, populationSuccessValue, populationValue].every(Number.isFinite) ||
        sampleValue < 0 ||
        sampleSizeValue < 0 ||
        populationSuccessValue < 0 ||
        populationValue < 0
      )
        return numberError();
      const sample = Math.trunc(sampleValue);
      const sampleSize = Math.trunc(sampleSizeValue);
      const populationSuccess = Math.trunc(populationSuccessValue);
      const population = Math.trunc(populationValue);
      const booleanEmptySample =
        args[1]?.kind === 'value' && args[1].sourceKind === FormulaNodeKind.Boolean && sampleSize === 0;
      if (
        sampleSize > population ||
        populationSuccess > population ||
        sample < Math.max(0, sampleSize + populationSuccess - population) ||
        (sample > Math.min(sampleSize, populationSuccess) && !booleanEmptySample)
      )
        return numberError();
      if (booleanEmptySample && sample > 0) return cumulative ? 1 : 0;
      const hyper = (value: number) =>
        value < Math.max(0, sampleSize + populationSuccess - population)
          ? 0
          : Math.exp(
              logGamma(populationSuccess + 1) -
                logGamma(value + 1) -
                logGamma(populationSuccess - value + 1) +
                logGamma(population - populationSuccess + 1) -
                logGamma(sampleSize - value + 1) -
                logGamma(population - populationSuccess - sampleSize + value + 1) -
                (logGamma(population + 1) - logGamma(sampleSize + 1) - logGamma(population - sampleSize + 1)),
            );
      if (!cumulative) return hyper(sample);
      let total = 0;
      for (let value = 0; value <= sample; value++) total += hyper(value);
      return total;
    }
    case 'CHISQ.DIST':
    case 'CHISQ.DIST.RT':
    case 'CHISQ.INV':
    case 'CHISQ.INV.RT': {
      if (name === 'CHISQ.DIST') {
        const x = statisticalScalarNumber(args[0]!, context);
        const df = statisticalScalarNumber(args[1]!, context);
        const cumulative = readBoolean(args, 2, context);
        if ([x, df, cumulative].some(isError)) return [x, df, cumulative].find(isError) as FormulaError;
        const degrees = Math.trunc(df);
        return cumulative ? chiSquareCdf(x, degrees) : chiSquarePdf(x, degrees);
      }
      if (name === 'CHISQ.DIST.RT') {
        const x = readNumber(args, 0, context);
        const df = readNumber(args, 1, context);
        if (isError(x) || isError(df)) return isError(x) ? x : df;
        const degrees = Math.trunc(df);
        return chiSquareRightTail(x, degrees);
      }
      if (name === 'CHISQ.INV') {
        const p = readNumber(args, 0, context);
        const df = readNumber(args, 1, context);
        if (isError(p) || isError(df)) return isError(p) ? p : df;
        if (df < 1 || df > 1e10 || p < 0 || p >= 1) return numberError();
        if (p === 0) return 0;
        const degrees = Math.trunc(df);
        return inverseCdf((value) => chiSquareCdf(value, degrees) as number, p, 0, Math.max(1, degrees));
      }
      const p = readNumber(args, 0, context);
      const df = readNumber(args, 1, context);
      if (isError(p) || isError(df)) return isError(p) ? p : df;
      if (df < 1 || df > 1e10 || p <= 0 || p > 1) return numberError();
      if (p === 1) return 0;
      const degrees = Math.trunc(df);
      return inverseCdf((value) => chiSquareRightTail(value, degrees) as number, p, 0, Math.max(1, degrees));
    }
    case 'F.DIST':
    case 'F.DIST.RT':
    case 'F.INV':
    case 'F.INV.RT': {
      if (name === 'F.DIST') {
        const x = readNumber(args, 0, context);
        const df1 = readNumber(args, 1, context);
        const df2 = readNumber(args, 2, context);
        const cumulative = readBoolean(args, 3, context);
        if ([x, df1, df2, cumulative].some(isError)) return [x, df1, df2, cumulative].find(isError) as FormulaError;
        const cdf = fCdf(x, Math.trunc(df1), Math.trunc(df2));
        const pdf = fPdf(x, Math.trunc(df1), Math.trunc(df2));
        return isError(cdf) || isError(pdf) ? (isError(cdf) ? cdf : pdf) : cumulative ? cdf : pdf;
      }
      const xOrP = readNumber(args, 0, context);
      const df1 = readNumber(args, 1, context);
      const df2 = readNumber(args, 2, context);
      if (isError(xOrP) || isError(df1) || isError(df2)) return [xOrP, df1, df2].find(isError) as FormulaError;
      const degrees1 = Math.trunc(df1);
      const degrees2 = Math.trunc(df2);
      if (degrees1 < 1 || degrees2 < 1) return numberError();
      if (name === 'F.DIST.RT') {
        return fRightTail(xOrP, degrees1, degrees2);
      }
      const upperTail = name === 'F.INV.RT';
      if (upperTail ? xOrP <= 0 || xOrP > 1 : xOrP < 0 || xOrP >= 1) return numberError();
      if ((upperTail && xOrP === 1) || (!upperTail && xOrP === 0)) return 0;
      if (xOrP === 0.5 && degrees1 === degrees2) return 1;
      if (degrees2 === 2) {
        const cumulative = upperTail ? 1 - xOrP : xOrP;
        const powered = Math.pow(cumulative, 2 / degrees1);
        const exponent = (2 * (upperTail && xOrP < 1e-8 ? Math.log1p(-xOrP) : Math.log(cumulative))) / degrees1;
        const gap = 1 - powered || -Math.expm1(exponent);
        return (2 * powered) / (degrees1 * gap);
      }
      const inverse = inverseCdf(
        (value) =>
          upperTail ? (fRightTail(value, degrees1, degrees2) as number) : (fCdf(value, degrees1, degrees2) as number),
        xOrP,
        0,
        100,
      );
      return inverse;
    }
    case 'T.DIST':
    case 'T.DIST.2T':
    case 'T.DIST.RT':
    case 'T.INV':
    case 'T.INV.2T': {
      if (name === 'T.DIST') {
        const x = readNumber(args, 0, context, undefined, false);
        const df = readNumber(args, 1, context, undefined, false);
        const cumulative = readBoolean(args, 2, context);
        if ([x, df, cumulative].some(isError)) return [x, df, cumulative].find(isError) as FormulaError;
        const cdf = studentTCdf(x, Math.trunc(df));
        const pdf = studentTPdf(x, Math.trunc(df));
        return isError(cdf) || isError(pdf) ? (isError(cdf) ? cdf : pdf) : cumulative ? cdf : pdf;
      }
      if (name === 'T.DIST.2T') {
        const x = readNumber(args, 0, context, undefined, false);
        const df = readNumber(args, 1, context);
        if (isError(x) || isError(df)) return isError(x) ? x : df;
        if (x < 0 || df < 1) return numberError();
        const tail = studentTRightTail(x, Math.trunc(df));
        return isError(tail) ? tail : 2 * tail;
      }
      if (name === 'T.DIST.RT') {
        const x = readNumber(args, 0, context, undefined, false);
        const df = readNumber(args, 1, context);
        if (isError(x) || isError(df)) return isError(x) ? x : df;
        if (df < 1) return numberError();
        return studentTRightTail(x, Math.trunc(df));
      }
      const p = readNumber(args, 0, context);
      const df = readNumber(args, 1, context);
      if (isError(p) || isError(df)) return isError(p) ? p : df;
      if (df < 1 || p <= 0 || p > 1 || (name === 'T.INV' && p === 1)) return numberError();
      if (p === 1) return 0;
      if (name === 'T.INV' && p === 0.5) return 0;
      const degrees = Math.trunc(df);
      if (name === 'T.INV') return inverseCdf((value) => studentTCdf(value, degrees) as number, p, -100, 100);
      const tail = inverseCdf((value) => 2 * (studentTRightTail(Math.abs(value), degrees) as number), p, 0, 100);
      return tail;
    }
    case 'CONFIDENCE.NORM': {
      const inputs = confidenceInputs(args, context, 1);
      if (isError(inputs)) return inputs;
      const [alpha, deviation, size] = inputs;
      const z = normalInverse(alpha / 2);
      return isError(z) ? z : (-z * deviation) / Math.sqrt(size);
    }
    case 'CONFIDENCE.T': {
      const inputs = confidenceInputs(args, context, 1);
      if (isError(inputs)) return inputs;
      const [alpha, deviation, size] = inputs;
      if (size === 1) return divisionError();
      const t = inverseCdf((value) => 2 * (studentTRightTail(value, size - 1) as number), alpha, 0, 100);
      return isError(t) ? t : (t * deviation) / Math.sqrt(size);
    }
    case 'WEIBULL.DIST': {
      const x = readNumber(args, 0, context);
      const alpha = readNumber(args, 1, context);
      const beta = readNumber(args, 2, context);
      const cumulative = readBoolean(args, 3, context);
      if ([x, alpha, beta, cumulative].some(isError)) return [x, alpha, beta, cumulative].find(isError) as FormulaError;
      if (x < 0 || alpha <= 0 || beta <= 0) return numberError();
      if (x === 0) return cumulative ? 0 : alpha < 1 ? numberError() : alpha === 1 ? 1 / beta : 0;
      const z = (x / beta) ** alpha;
      if (cumulative) return -Math.expm1(-z);
      const density = (alpha / beta) * (x / beta) ** (alpha - 1) * Math.exp(-z);
      return Number.isFinite(density) ? density : numberError();
    }
    case 'F.TEST': {
      if (args.length !== 2) return valueError();
      const valuesA = numericValues([args[0]!], context);
      const valuesB = numericValues([args[1]!], context);
      if (isError(valuesA) || isError(valuesB)) return isError(valuesA) ? valuesA : valuesB;
      if (valuesA.length < 2 || valuesB.length < 2) return divisionError();
      const varianceA = variance(valuesA, true);
      const varianceB = variance(valuesB, true);
      if (isError(varianceA) || isError(varianceB) || varianceB === 0) return divisionError();
      if (varianceA === varianceB) return 1;
      const ratio = varianceA / varianceB;
      const cdf = fCdf(ratio, valuesA.length - 1, valuesB.length - 1) as number;
      return 2 * Math.min(cdf, 1 - cdf);
    }
    case 'CHISQ.TEST': {
      if (args.length !== 2) return valueError();
      if (args.some((arg) => isBlankScalarInput(arg, context))) return valueError();
      const actualShape = matrixFromArg(args[0]!, context);
      const expectedShape = matrixFromArg(args[1]!, context);
      if (isError(actualShape) || isError(expectedShape)) return isError(actualShape) ? actualShape : expectedShape;
      for (const matrix of [actualShape, expectedShape]) {
        for (const row of matrix) {
          const cellError = row.find(isError);
          if (cellError) return cellError;
        }
      }
      if (
        actualShape.length !== expectedShape.length ||
        actualShape.some((row, index) => row.length !== expectedShape[index]?.length)
      )
        return notAvailable();
      const actual = numericMatrixFromArg(args[0]!, context);
      const expected = numericMatrixFromArg(args[1]!, context);
      if (isError(actual) || isError(expected)) return isError(actual) ? actual : expected;
      if (
        actual.length === 0 ||
        actual.length !== expected.length ||
        actual.some((row, rowIndex) => row.length !== expected[rowIndex]?.length)
      )
        return error(FormulaErrorCode.NotAvailable);
      if (expected.some((row) => row.some((value) => value === 0))) return divisionError();
      const rowCount = actual.length;
      const columnCount = actual[0]?.length ?? 0;
      const statistic = actual.reduce(
        (sum, row, rowIndex) =>
          sum +
          row.reduce((rowSum, actualValue, columnIndex) => {
            const expectedValue = expected[rowIndex]![columnIndex]!;
            if (actualValue === undefined || expectedValue === undefined) return rowSum;
            return rowSum + (actualValue - expectedValue) ** 2 / expectedValue;
          }, 0),
        0,
      );
      const df =
        rowCount > 1 && columnCount > 1 ? (rowCount - 1) * (columnCount - 1) : Math.max(1, rowCount * columnCount - 1);
      return regularizedGammaQ(df / 2, statistic / 2);
    }
    case 'T.TEST': {
      if (args.length !== 4) return valueError();
      const blankScalar = args.slice(0, 2).some((arg) => isBlankScalarInput(arg, context));
      const leftShape = matrixFromArg(args[0]!, context);
      const rightShape = matrixFromArg(args[1]!, context);
      if (isError(leftShape) || isError(rightShape)) return isError(leftShape) ? leftShape : rightShape;
      const type = readNumber(args, 3, context);
      if (blankScalar) {
        return valueError();
      }
      const pair = type === 1 ? pairValues(args.slice(0, 2), context, true) : arrays(args.slice(0, 2), context);
      if (isError(pair)) return pair;
      const tails = readNumber(args, 2, context);
      if (isError(tails) || isError(type) || pair.length !== 2) return isError(tails) ? tails : type;
      if (!Number.isInteger(tails) || !Number.isInteger(type) || tails < 1 || tails > 2 || type < 1 || type > 3)
        return numberError();
      if (type === 1 && leftShape.flat().length !== rightShape.flat().length) return notAvailable();
      const left = pair[0]!;
      const right = pair[1]!;
      let t: number;
      let df: number;
      if (type === 1) {
        if (left.length !== right.length) return error(FormulaErrorCode.NotAvailable);
        const differences = left.map((value, index) => value - right[index]!);
        const sd = standardDeviation(differences, true);
        if (isError(sd)) return sd;
        if (sd === 0) return divisionError();
        t = (mean(differences) as number) / (sd / Math.sqrt(differences.length));
        df = differences.length - 1;
      } else {
        const leftMean = mean(left) as number;
        const rightMean = mean(right) as number;
        const leftVar = variance(left, true) as number;
        const rightVar = variance(right, true) as number;
        if (type === 2) {
          df = left.length + right.length - 2;
          const pooled = ((left.length - 1) * leftVar + (right.length - 1) * rightVar) / df;
          const se = Math.sqrt(pooled * (1 / left.length + 1 / right.length));
          if (se === 0) return divisionError();
          t = (leftMean - rightMean) / se;
        } else {
          const se = Math.sqrt(leftVar / left.length + rightVar / right.length);
          if (se === 0) return divisionError();
          t = (leftMean - rightMean) / se;
          df =
            (leftVar / left.length + rightVar / right.length) ** 2 /
            ((leftVar / left.length) ** 2 / (left.length - 1) + (rightVar / right.length) ** 2 / (right.length - 1));
        }
      }
      const p = 1 - (studentTCdf(Math.abs(t), df) as number);
      return tails === 2 ? 2 * p : p;
    }
    case 'Z.TEST':
    case 'ZTEST': {
      if (args.length < 2 || args.length > 3) return valueError();
      const singleCell =
        isFormulaArgumentKind(args[0]!, FormulaNodeKind.Cell) ||
        isFormulaArgumentKind(args[0]!, FormulaNodeKind.WorkbookCell);
      if (isBlankScalarInput(args[0]!, context))
        return singleCell ? divisionError() : error(FormulaErrorCode.NotAvailable);
      const direct = directStatisticalNumber(args[0]!, context);
      if (isError(direct)) return direct;
      const values = direct === undefined ? numericValues([args[0]!], context) : [direct];
      const target = readNumber(args, 1, context);
      const sigma = readOptionalNumber(args, 2, context);
      if (isError(values) || isError(target) || isError(sigma))
        return [values, target, sigma].find(isError) as FormulaError;
      if (values.length === 0) return singleCell ? divisionError() : error(FormulaErrorCode.NotAvailable);
      if (sigma !== undefined && sigma <= 0) return numberError();
      if (sigma === undefined && values.length < 2) return divisionError();
      const sampleRoot = name === 'ZTEST' ? Math.fround(Math.sqrt(values.length)) : Math.sqrt(values.length);
      const standardError =
        sigma === undefined ? (standardDeviation(values, true) as number) / sampleRoot : sigma / sampleRoot;
      if (!Number.isFinite(standardError) || standardError === 0) return divisionError();
      return normalCdf(-(((mean(values) as number) - target) / standardError));
    }
    case 'PERMUT':
    case 'PERMUTATIONA': {
      if (name === 'PERMUTATIONA' && args.length !== 2) return error(FormulaErrorCode.Name);
      const nValue = readNumber(args, 0, context);
      const chosenValue = readNumber(args, 1, context);
      if (isError(nValue)) return nValue;
      if (isError(chosenValue)) return chosenValue;
      if (name === 'PERMUT' && chosenValue < 0) return numberError();
      const rawN = Math.trunc(nValue);
      const chosen = Math.trunc(chosenValue);
      if (rawN < 0 || chosen < 0 || (name === 'PERMUT' && rawN === 0)) return numberError();
      if (!Number.isSafeInteger(rawN) || !Number.isSafeInteger(chosen)) return numberError();
      const n = name === 'PERMUT' ? Math.min(rawN, 2_147_483_647) : rawN;
      if (name === 'PERMUT' && chosen > n) return numberError();
      if (name === 'PERMUTATIONA') {
        const result = n ** chosen;
        return Number.isFinite(result) ? result : numberError();
      }
      let result = 1;
      for (let factor = 0; factor < chosen; factor++) {
        result *= n - factor;
        if (!Number.isFinite(result)) return numberError();
      }
      return result;
    }
    case 'PROB': {
      if (args.length < 3 || args.length > 4) return valueError();
      if (isBlankScalarInput(args[0]!, context)) return valueError();
      const valueEntries = entriesForArg(args[0]!, context);
      const probabilityEntries = entriesForArg(args[1]!, context);
      if (isError(valueEntries)) return valueEntries;
      if (isError(probabilityEntries)) return probabilityEntries;
      const values = numericValues([args[0]!], context);
      const probabilities = numericValues([args[1]!], context);
      const lower = readNumber(args, 2, context);
      const upper = readNumber(args, 3, context, lower as number);
      if (isError(values) || isError(probabilities) || isError(lower) || isError(upper))
        return [values, probabilities, lower, upper].find(isError) as FormulaError;
      if (valueEntries.length !== probabilityEntries.length) {
        for (const [arg, source] of [
          [args[0]!, valueEntries],
          [args[1]!, probabilityEntries],
        ] as const) {
          if (source.length !== 1 || (arg.kind === 'value' && Array.isArray(arg.value))) continue;
          if (typeof source[0]!.value !== 'number') return valueError();
        }
        return notAvailable();
      }
      for (const [source, parsed] of [
        [valueEntries, values],
        [probabilityEntries, probabilities],
      ] as const) {
        if (source.length !== 1 || parsed.length !== 0) continue;
        const value = source[0]!.value;
        const text = isFormulaText(value) ? value.value : value;
        if (typeof text === 'string' && (text === '' || !Number.isFinite(Number(text)))) return valueError();
      }
      if (
        (valueEntries.length === 1 && values.length === 0) ||
        (probabilityEntries.length === 1 && probabilities.length === 0)
      )
        return valueError();
      if (
        values.length !== valueEntries.length ||
        probabilities.length !== probabilityEntries.length ||
        probabilities.some((probability: number) => probability <= 0 || probability > 1) ||
        Math.abs(probabilities.reduce((sum: number, probability: number) => sum + probability, 0) - 1) > 1e-10
      )
        return numberError();
      return values.reduce(
        (sum, value, index) => sum + (value >= lower && value <= upper ? probabilities[index]! : 0),
        0,
      );
    }
    case 'STANDARDIZE': {
      const value = readNumber(args, 0, context);
      const average = readNumber(args, 1, context);
      const deviation = readNumber(args, 2, context);
      if (isError(value) || isError(average) || isError(deviation))
        return [value, average, deviation].find(isError) as FormulaError;
      return deviation <= 0 ? numberError() : standardize(value, average, deviation);
    }
    case 'FORECAST.ETS': {
      return evaluateForecastEts('FORECAST.ETS', args, context, normalInverse);
    }
    case 'FORECAST.ETS.CONFINT': {
      return evaluateForecastEts('FORECAST.ETS.CONFINT', args, context, normalInverse);
    }
    case 'FORECAST.ETS.SEASONALITY': {
      return evaluateForecastEts('FORECAST.ETS.SEASONALITY', args, context, normalInverse);
    }
    case 'FORECAST.ETS.STAT': {
      return evaluateForecastEts('FORECAST.ETS.STAT', args, context, normalInverse);
    }
    default:
      return error(FormulaErrorCode.Name);
  }
}

function notAvailable(): FormulaError {
  return error(FormulaErrorCode.NotAvailable);
}

function truncateTo(value: number, digits: number): number {
  if (digits >= 16) return value;
  const factor = 10 ** Math.max(0, Math.trunc(digits));
  return Math.trunc(value * factor) / factor;
}

/** Creates one registered statistics formula backed by the shared statistical runtime. */
export function createStatisticsFunction(name: string): FormulaFunction {
  return {
    name,
    evaluate(args, context) {
      return evaluateStatistics(name, args, context);
    },
  };
}
