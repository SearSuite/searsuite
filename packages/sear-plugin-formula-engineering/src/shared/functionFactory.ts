import type { FormulaArg, FormulaError, FormulaFunction, FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { mapArguments, numeric, text } from './arguments';
import { dateTextAsNumber } from './computedDateText';
import { isFormulaError, valueError } from './errors';

type ScalarOperation = (values: readonly FormulaValue[], args: readonly FormulaArg[]) => FormulaValue;

export function engineeringFunction(options: {
  name: string;
  summary: string;
  example: string;
  minArgs: number;
  maxArgs: number;
  arityError?: () => FormulaError;
  numericDateText?: boolean;
  computedDateText?: boolean;
  parameters: FormulaFunction['descriptor'] extends infer _ ? readonly string[] : never;
  operation: ScalarOperation;
}): FormulaFunction {
  return {
    name: options.name,
    descriptor: {
      version: 1,
      category: 'Engineering',
      summary: options.summary,
      example: options.example,
      parameters: options.parameters.map((name, index) => ({
        name,
        description: `${name} argument.`,
        optional: index >= options.minArgs,
        accepts: ['any'],
      })),
      returnKind: 'scalar-or-array',
    },
    evaluate(args, context) {
      if (args.length < options.minArgs || args.length > options.maxArgs)
        return options.arityError?.() ?? valueError();
      return mapArguments(args, context, (values) => options.operation(values.map((value, index) =>
        options.numericDateText
          ? dateTextAsNumber(value, context)
          : options.computedDateText !== false && options.parameters[index]?.startsWith('inumber')
            ? dateTextAsNumber(value, context)
            : value), args));
    },
  };
}

export function numbers(values: readonly FormulaValue[]): number[] | ReturnType<typeof valueError> {
  const result = values.map(numeric);
  const error = result.find(isFormulaError);
  return error ?? (result as number[]);
}

export function texts(values: readonly FormulaValue[]): string[] | ReturnType<typeof valueError> {
  const result = values.map(text);
  const error = result.find(isFormulaError);
  return error ?? (result as string[]);
}
