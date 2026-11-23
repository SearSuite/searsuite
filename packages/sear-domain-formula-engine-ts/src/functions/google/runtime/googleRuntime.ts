import {
  FormulaErrorCode,
  FormulaFunctionArguments,
  FormulaGoogleServiceDefinition,
  FormulaServiceCacheStatus,
  createFormulaError,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaFunction,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { matrixArg } from '../../lookup/lookupHelpers';
import { readArg } from '../../shared/helpers';

export const valueError = () => createFormulaError(FormulaErrorCode.Value);

export function createCachedGoogleFunction(name: string, summary: string, example: string): FormulaFunction {
  return {
    name,
    descriptor: {
      version: 1,
      summary,
      category: 'Google',
      example,
      parameters: [
        { name: 'arguments', description: 'Function-specific arguments.', repeating: true, accepts: ['any'] },
      ],
      returnKind: 'scalar-or-array',
      externalServices: [FormulaGoogleServiceDefinition.id],
    },
    evaluate(args, context) {
      const values: FormulaValue[] = [];
      for (let index = 0; index < args.length; index++) {
        const value = readArg(args[index]!, context);
        if (isFormulaError(value)) return value;
        values.push(value);
      }
      const result = context.externalServices
        ?.get(FormulaGoogleServiceDefinition)
        ?.read({ functionName: name, arguments: values });
      return result?.status === FormulaServiceCacheStatus.Ready
        ? result.value
        : createFormulaError(FormulaErrorCode.NotAvailable);
    },
  };
}

export function unaryNumber(
  args: FormulaArg[],
  context: EvalContext,
  operation: (value: number) => number,
): FormulaValue {
  if (args.length !== 1) return valueError();
  const value = new FormulaFunctionArguments(args, context).number(0);
  return isFormulaError(value) ? value : operation(value);
}

export function binaryNumber(
  args: FormulaArg[],
  context: EvalContext,
  operation: (left: number, right: number) => FormulaValue,
): FormulaValue {
  if (args.length !== 2) return valueError();
  const reader = new FormulaFunctionArguments(args, context);
  const left = reader.number(0);
  if (isFormulaError(left)) return left;
  const right = reader.number(1);
  return isFormulaError(right) ? right : operation(left, right);
}

export function binaryValues(
  args: FormulaArg[],
  context: EvalContext,
  operation: (left: FormulaValue, right: FormulaValue) => FormulaValue,
): FormulaValue {
  if (args.length !== 2) return valueError();
  const reader = new FormulaFunctionArguments(args, context);
  const left = reader.value(0);
  if (isFormulaError(left)) return left;
  const right = reader.value(1);
  return isFormulaError(right) ? right : operation(left, right);
}

export function comparable(value: FormulaValue): string | number | boolean {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'value' in value)
    return String(value.value).toLowerCase();
  return typeof value === 'string' ? value.toLowerCase()
    : typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
}

export function matrix(args: FormulaArg[], index: number, context: EvalContext) {
  return matrixArg(args[index], context);
}
