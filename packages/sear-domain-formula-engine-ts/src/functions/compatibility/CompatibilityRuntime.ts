import {
  FormulaErrorCode,
  FormulaFunctionArguments,
  FormulaNodeKind,
  createFormulaError,
  isFormulaArgumentKind,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaFunction,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { createStatisticsFunction } from '../math/statistics/StatisticsRuntime';
import { normalizeNearInteger } from '../math/rounding/roundingUtils';
import { isBlankScalarInput } from '../shared/blankScalarInput';
import { numericDateText } from '../shared/formulaNumericDateText';
import { readArg } from '../shared/helpers';

const aliases: Readonly<Record<string, string>> = {
  BETAINV: 'BETA.INV',
  BINOMDIST: 'BINOM.DIST',
  CHIDIST: 'CHISQ.DIST.RT',
  CHIINV: 'CHISQ.INV.RT',
  CHITEST: 'CHISQ.TEST',
  CONFIDENCE: 'CONFIDENCE.NORM',
  COVAR: 'COVARIANCE.P',
  CRITBINOM: 'BINOM.INV',
  EXPONDIST: 'EXPON.DIST',
  FDIST: 'F.DIST.RT',
  FINV: 'F.INV.RT',
  FTEST: 'F.TEST',
  GAMMADIST: 'GAMMA.DIST',
  GAMMAINV: 'GAMMA.INV',
  LOGINV: 'LOGNORM.INV',
  MODE: 'MODE.SNGL',
  'NORM.INV': 'NORMINV',
  NORMDIST: 'NORM.DIST',
  NORMSINV: 'NORM.S.INV',
  PERCENTILE: 'PERCENTILE.INC',
  PERCENTRANK: 'PERCENTRANK.INC',
  POISSON: 'POISSON.DIST',
  QUARTILE: 'QUARTILE.INC',
  RANK: 'RANK.EQ',
  STDEV: 'STDEV.S',
  STDEVP: 'STDEV.P',
  TTEST: 'T.TEST',
  VARP: 'VAR.P',
  WEIBULL: 'WEIBULL.DIST',
};

/** Creates an Excel legacy compatibility function with explicit signature adaptation. */
export function createCompatibilityFunction(name: string): FormulaFunction {
  return {
    name,
    evaluate(args, context) {
      if (name === 'CEILING' || name === 'FLOOR') return legacyMultipleRound(name, args, context);
      if (name === 'TDIST') return legacyTDist(args, context);
      if (name === 'TINV') return delegate('T.INV.2T', args, context);
      if (name === 'BETADIST') return delegate('BETA.DIST', insert(args, 3, valueArg(true)), context);
      if (name === 'BETAINV' && args.length >= 3 && args.length <= 5) {
        const reader = new FormulaFunctionArguments(args, context);
        const probability = reader.number(0);
        if (!isFormulaError(probability) && (probability === 0 || probability === 1)) {
          const alpha = reader.number(1);
          const beta = reader.number(2);
          const lower = args[3] ? reader.number(3) : 0;
          const upper = args[4] ? reader.number(4) : 1;
          if (isFormulaError(alpha)) return alpha;
          if (isFormulaError(beta)) return beta;
          if (isFormulaError(lower)) return lower;
          if (isFormulaError(upper)) return upper;
          if (alpha <= 0 || beta <= 0 || upper <= lower)
            return createFormulaError(FormulaErrorCode.Number);
          return probability === 0 ? lower : upper;
        }
      }
      if (name === 'HYPGEOMDIST') return legacyHypergeometric(args, context);
      if (name === 'POISSON' && args.length === 3 &&
        (args[1].kind === FormulaNodeKind.Cell || args[1].kind === FormulaNodeKind.WorkbookCell)) {
        const dateValue = numericDateText(readArg(args[1], context), context);
        if (dateValue !== undefined)
          return delegate('POISSON.DIST', [args[0]!, valueArg(dateValue), args[2]!], context);
      }
      if (name === 'QUARTILE' && args.length === 2 && args[0]?.kind === 'value' &&
        args[0].sourceKind === FormulaNodeKind.String) {
        const dateValue = numericDateText(args[0].value, context);
        if (dateValue !== undefined)
          return delegate('QUARTILE.INC', [valueArg(dateValue), args[1]!], context);
      }
      if (name === 'LOGNORMDIST') return delegate('LOGNORM.DIST', [...args, valueArg(true)], context);
      if (name === 'NEGBINOMDIST') return delegate('NEGBINOM.DIST', [...args, valueArg(false)], context);
      if (name === 'NORMSDIST') return delegate('NORM.S.DIST', [...args, valueArg(true)], context);
      if (name === 'CHITEST') {
        for (const arg of args) {
          const value = readArg(arg, context);
          if (typeof value === 'boolean' || typeof value === 'string' ||
            (typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'text')) {
            return createFormulaError(FormulaErrorCode.Value);
          }
        }
      }
      if (name === 'FTEST' && args.some((arg) => {
        if (isBlankScalarInput(arg, context)) return true;
        const value = readArg(arg, context);
        return typeof value === 'string' || typeof value === 'boolean' || isFormulaText(value);
      })) return createFormulaError(FormulaErrorCode.Value);
      if (name === 'COVAR' && args.some((arg) => isBlankScalarInput(arg, context))) {
        return createFormulaError(FormulaErrorCode.Value);
      }
      if (name === 'COVAR' && args.some((arg) => typeof readArg(arg, context) === 'boolean')) {
        return createFormulaError(FormulaErrorCode.Value);
      }
      if (name === 'COVAR' && args.length === 2 && args.some((arg, index) => {
        if (arg.kind !== 'value' || arg.sourceKind !== FormulaNodeKind.Call) return false;
        const value = readArg(arg, context);
        const text = isFormulaText(value) ? value.value : value;
        const other = readArg(args[1 - index]!, context);
        return typeof text === 'string' && text.trim() !== '' && Number.isFinite(Number(text)) &&
          Array.isArray(other) && (other.length > 1 ||
            other.some((item) => Array.isArray(item) && item.length > 1));
      })) {
        return createFormulaError(FormulaErrorCode.Value);
      }
      if (name === 'TTEST') {
        if (args.slice(0, 2).some((arg) => isBlankScalarInput(arg, context)))
          return createFormulaError(FormulaErrorCode.Value);
        for (const arg of args.slice(0, 2)) {
          if (arg.kind !== 'value' && arg.kind !== FormulaNodeKind.Cell &&
            arg.kind !== FormulaNodeKind.WorkbookCell && arg.kind !== 'expression') continue;
          const value = readArg(arg, context);
          const text = isFormulaText(value) ? value.value : value;
          if (typeof text === 'string' && (text === '' || !Number.isFinite(Number(text))))
            return createFormulaError(FormulaErrorCode.Value);
        }
        const tails = new FormulaFunctionArguments(args, context).number(2);
        if (typeof tails === 'number' && tails > 1 && tails < 2)
          return delegate('T.TEST', [args[0]!, args[1]!, valueArg(1), args[3]!], context);
      }
      if (name === 'ZTEST') {
        if (args[0]) {
          if (isBlankScalarInput(args[0], context)) return createFormulaError(FormulaErrorCode.NotAvailable);
          if (isFormulaArgumentKind(args[0], FormulaNodeKind.Cell) ||
            isFormulaArgumentKind(args[0], FormulaNodeKind.WorkbookCell)) {
            const value = readArg(args[0], context);
            if (!isFormulaError(value) && typeof value !== 'number')
              return createFormulaError(FormulaErrorCode.NotAvailable);
          }
        }
        return delegate('ZTEST', args, context);
      }
      if (name === 'MODE') {
        for (const arg of args) {
          const value = readArg(arg, context);
          if (typeof value === 'boolean' || typeof value === 'string' ||
            (typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'text')) {
            return createFormulaError(FormulaErrorCode.Value);
          }
        }
      }
      const target = aliases[name];
      return target ? delegate(target, args, context) : createFormulaError(FormulaErrorCode.Name);
    },
  };
}

function delegate(name: string, args: FormulaArg[], context: EvalContext): FormulaValue {
  return createStatisticsFunction(name).evaluate(args, context);
}

function legacyHypergeometric(args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length === 4 && args[1]?.kind === 'value' &&
    args[1].sourceKind === FormulaNodeKind.Boolean && readArg(args[1], context) === false) {
    const sample = new FormulaFunctionArguments(args, context).number(0);
    if (!isFormulaError(sample) && sample > 0) return createFormulaError(FormulaErrorCode.Number);
  }
  return delegate('HYPGEOM.DIST', [...args, valueArg(false)], context);
}

function legacyTDist(args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length !== 3) return createFormulaError(FormulaErrorCode.Value);
  const tails = new FormulaFunctionArguments(args, context).integer(2);
  if (isFormulaError(tails)) return tails;
  if (tails !== 1 && tails !== 2) return createFormulaError(FormulaErrorCode.Number);
  return delegate(tails === 1 ? 'T.DIST.RT' : 'T.DIST.2T', args.slice(0, 2), context);
}

function legacyMultipleRound(name: string, args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length !== 2) return createFormulaError(FormulaErrorCode.Value);
  const reader = new FormulaFunctionArguments(args, context);
  const numeric = reader.number(0);
  const number = isFormulaError(numeric) ? numericDateText(readArg(args[0], context), context) ?? numeric : numeric;
  const significant = reader.number(1);
  const significance = isFormulaError(significant)
    ? numericDateText(readArg(args[1], context), context) ?? significant
    : significant;
  if (isFormulaError(number)) return number;
  if (isFormulaError(significance)) return significance;
  if (significance === 0) return name === 'FLOOR' && number !== 0
    ? createFormulaError(FormulaErrorCode.DivisionByZero)
    : 0;
  if (number > 0 && significance < 0) return createFormulaError(FormulaErrorCode.Number);
  const quotient = number / Math.abs(significance);
  if (Number.isFinite(quotient) && quotient !== 0 && normalizeNearInteger(quotient) !== quotient) {
    return number;
  }
  if (name === 'CEILING') {
    const rounded = number < 0 && significance < 0 ? Math.floor(quotient) : Math.ceil(quotient);
    return rounded * Math.abs(significance);
  }
  const rounded = number < 0 && significance < 0 ? Math.ceil(quotient) : Math.floor(quotient);
  return rounded * Math.abs(significance);
}

function insert(args: FormulaArg[], index: number, value: FormulaArg): FormulaArg[] {
  return [...args.slice(0, index), value, ...args.slice(index)];
}

function valueArg(value: FormulaValue): FormulaArg {
  return { kind: 'value', value };
}
