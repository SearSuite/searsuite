import {
  FormulaErrorCode,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { readArg } from '../../shared/helpers';
import { isFormulaErrorValue, readScalar } from '../shared/mathUtils';
import { regressionInputShape, regressionInputSize, type RegressionInputShape } from './regressionInputShape';

/** Checks the shared argument contract before an ETS forecast or statistic is evaluated. */
export function forecastEtsInputError(
  args: FormulaArg[],
  context: EvalContext,
  valueIndex: number,
  timelineIndex: number,
  requiredCount: number,
): FormulaError | undefined {
  if (args.length < requiredCount || args.slice(0, requiredCount).some((arg) => !arg || arg.kind === 'missing'))
    return createFormulaError(FormulaErrorCode.Name);

  const shapes: RegressionInputShape[] = [];
  for (const index of [valueIndex, timelineIndex]) {
    const shape = regressionInputShape(args[index]!, context);
    if ('kind' in shape) return shape;
    if (shape[0] > 1 && shape[1] > 1) return createFormulaError(FormulaErrorCode.Name);
    shapes.push(shape);
  }
  if (regressionInputSize(shapes[0]!) !== regressionInputSize(shapes[1]!)) {
    return createFormulaError(FormulaErrorCode.NotAvailable);
  }

  for (let index = Math.max(valueIndex, timelineIndex) + 1; index < args.length; index++) {
    const arg = args[index];
    if (!arg || arg.kind === 'missing') continue;
    const value = readArg(arg, context);
    if (value && typeof value === 'object' && 'kind' in value && value.kind === 'error') return value;
    const numeric = readScalar(args, index, context);
    if (isFormulaErrorValue(numeric)) return numeric;
  }
  return undefined;
}
