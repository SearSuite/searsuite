import {
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaFunction,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError as isErrorValue, isFormulaText } from '@searsuite/sear-foundation-utils';
import { isRangeArgument, matrixFromArg } from '../math/shared/mathUtils';
import { isTruthy, readArg, readLazyArg } from '../shared/helpers';
import { isBlankScalarInput } from '../shared/blankScalarInput';
import { mapArrayValues, readArrayArgument } from '../shared/arrayArgumentValues';
import { conditionalValueAt, replaceConditionalErrors } from './conditionalArrayValues';

/** Creates a logical function backed by the shared logical runtime. */
export function createLogicalFunction(name: string): FormulaFunction {
  const lazy = name === 'IFNA' || name === 'IFS' || name === 'SWITCH';
  return { name, ...(lazy ? { lazy: true } : {}), evaluate: (args, context) => evaluateLogical(name, args, context) };
}

function evaluateLogical(name: string, args: FormulaArg[], context: EvalContext): FormulaValue {
  if (name === 'TRUE' || name === 'FALSE') return args.length === 0 ? name === 'TRUE' : valueError();
  if (name === 'NOT') {
    if (args.length !== 1) return valueError();
    const value = readArg(args[0], context);
    const text = isFormulaText(value) ? value.value : typeof value === 'string' ? value : undefined;
    if (text !== undefined && !/^(true|false)$/i.test(text.trim())) return valueError();
    const truth = isTruthy(value);
    return isErrorValue(truth) ? truth : !truth;
  }
  if (name === 'AND' || name === 'OR' || name === 'XOR') return aggregateLogical(name, args, context);
  if (name === 'IFNA') {
    if (args.length !== 2) return valueError();
    const value = readArrayArgument(args[0], context);
    return replaceConditionalErrors(
      value,
      () => readArrayArgument(args[1], context),
      (item) => isErrorValue(item) && item.code === FormulaErrorCode.NotAvailable,
    );
  }
  if (name === 'IFS') return evaluateIfs(args, context);
  if (name === 'SWITCH') return evaluateSwitch(args, context);
  return createFormulaError(FormulaErrorCode.Name);
}

function aggregateLogical(name: string, args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length === 0 || args.length > 255) return valueError();
  const values: boolean[] = [];
  for (const arg of args) {
    if (isBlankScalarInput(arg, context)) continue;
    const matrix = matrixFromArg(arg, context);
    if (isErrorValue(matrix)) return matrix;
    for (const row of matrix)
      for (const value of row) {
        if (isErrorValue(value)) return value;
        if (
          typeof value === 'string' ||
          (typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'text')
        ) {
          if (!isRangeArgument(arg) && !isFormulaText(value)) {
            if (!/^(true|false)$/i.test(value.trim())) {
              if (arg.kind === 'value' && arg.sourceKind === FormulaNodeKind.Call) continue;
              return valueError();
            }
            values.push(/^true$/i.test(value.trim()));
          }
          continue;
        }
        const truth = isTruthy(value);
        if (isErrorValue(truth)) return truth;
        values.push(truth);
      }
  }
  if (values.length === 0) return valueError();
  if (name === 'AND') return values.every(Boolean);
  if (name === 'OR') return values.some(Boolean);
  return values.filter(Boolean).length % 2 === 1;
}

function evaluateIfs(args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length < 2 || args.length % 2 !== 0 || args.length > 254) return valueError();
  const cache = new Map<number, FormulaValue>();
  const read = (index: number): FormulaValue => {
    if (!cache.has(index)) cache.set(index, readArrayArgument(args[index], context));
    return cache.get(index)!;
  };
  for (let index = 0; index < args.length; index += 2) {
    const condition = read(index);
    if (Array.isArray(condition)) return mapArrayValues(condition, (_, row, col) => {
      for (let current = index; current < args.length; current += 2) {
        const truth = isTruthy(conditionalValueAt(read(current), row, col));
        if (isErrorValue(truth)) return truth;
        if (truth) return conditionalValueAt(read(current + 1), row, col);
      }
      return createFormulaError(FormulaErrorCode.NotAvailable);
    });
    const truth = isTruthy(condition);
    if (isErrorValue(truth)) return truth;
    if (truth) return read(index + 1);
  }
  return createFormulaError(FormulaErrorCode.NotAvailable);
}

function evaluateSwitch(args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length < 3 || args.length > 254) return valueError();
  const expression = readArrayArgument(args[0], context);
  if (isErrorValue(expression)) return expression;
  const hasDefault = args.length % 2 === 0;
  const limit = hasDefault ? args.length - 1 : args.length;
  if (Array.isArray(expression)) {
    const cache = new Map<number, FormulaValue>();
    const read = (index: number): FormulaValue => {
      if (!cache.has(index)) cache.set(index, readArrayArgument(args[index], context));
      return cache.get(index)!;
    };
    return mapArrayValues(expression, (item, row, col) => {
      if (isErrorValue(item)) return item;
      for (let index = 1; index < limit; index += 2) {
        const candidate = conditionalValueAt(read(index), row, col);
        if (isErrorValue(candidate)) return candidate;
        if (equal(item, candidate)) return conditionalValueAt(read(index + 1), row, col);
      }
      return hasDefault
        ? conditionalValueAt(read(args.length - 1), row, col)
        : createFormulaError(FormulaErrorCode.NotAvailable);
    });
  }
  for (let index = 1; index < limit; index += 2) {
    const candidate = readLazyArg(args[index], context);
    if (isErrorValue(candidate)) return candidate;
    if (equal(expression, candidate)) return readLazyArg(args[index + 1], context);
  }
  return hasDefault ? readLazyArg(args[args.length - 1], context) : createFormulaError(FormulaErrorCode.NotAvailable);
}

function equal(left: FormulaValue, right: FormulaValue): boolean {
  const leftText = isFormulaText(left) ? left.value : typeof left === 'string' ? left : null;
  const rightText = isFormulaText(right) ? right.value : typeof right === 'string' ? right : null;
  if (leftText !== null && rightText !== null) return leftText.toLowerCase() === rightText.toLowerCase();
  if (Array.isArray(left) || Array.isArray(right) || typeof left === 'object' || typeof right === 'object')
    return left === right;
  return left === right;
}

function valueError() {
  return createFormulaError(FormulaErrorCode.Value);
}
