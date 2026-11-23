import {
  FormulaFunctionArguments,
  isFormulaError,
  type FormulaFunction,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { compareSortValues, matrixArg, valueError } from './sortnRuntime';

type SortKey = { values: FormulaValue[]; direction: 1 | -1 };

/** SORTN returns the first ranked rows after sorting. Example: =SORTN({3;1;2},2) returns {1;2}. */
export const SORTN: FormulaFunction = {
  name: 'SORTN',
  evaluate(args, context) {
    if (args.length < 1) return valueError();
    const source = matrixArg(args[0], context);
    if (isFormulaError(source)) return source;
    const reader = new FormulaFunctionArguments(args, context);
    const count = reader.integer(1, 1);
    if (isFormulaError(count) || count <= 0) return isFormulaError(count) ? count : valueError();
    const mode = reader.integer(2, 0);
    if (isFormulaError(mode) || mode < 0 || mode > 3) return isFormulaError(mode) ? mode : valueError();

    const keys: SortKey[] = [];
    if (args.length <= 3) {
      for (let column = 0; column < (source[0]?.length ?? 0); column++) {
        keys.push({ values: source.map((row) => row[column] ?? null), direction: 1 });
      }
    } else {
      for (let index = 3; index < args.length; index += 2) {
        const ascending = reader.boolean(index + 1, true);
        if (isFormulaError(ascending)) return ascending;
        const candidate = matrixArg(args[index], context);
        if (isFormulaError(candidate)) return candidate;
        let values: FormulaValue[];
        if (candidate.length === 1 && candidate[0]?.length === 1) {
          const column = reader.integer(index, 1);
          if (isFormulaError(column) || column < 1 || source.some((row) => column > row.length))
            return isFormulaError(column) ? column : valueError();
          values = source.map((row) => row[column - 1]!);
        } else {
          if (candidate.length !== source.length || candidate.some((row) => row.length !== 1)) return valueError();
          values = candidate.map((row) => row[0]!);
        }
        keys.push({ values, direction: ascending ? 1 : -1 });
      }
    }

    const compareKeys = (left: number, right: number): number => {
      for (const key of keys) {
        const comparison = key.direction * compareSortValues(key.values[left]!, key.values[right]!);
        if (comparison !== 0) return comparison;
      }
      return 0;
    };
    const sorted = source.map((row, index) => ({ row, index }))
      .sort((left, right) => compareKeys(left.index, right.index) || left.index - right.index);
    if (mode === 0) return sorted.slice(0, count).map((entry) => entry.row);
    if (mode === 1) {
      const cutoff = sorted[count - 1];
      return (cutoff ? sorted.filter((entry, index) => index < count || sameRow(entry.row, cutoff.row))
        : sorted).map((entry) => entry.row);
    }
    const unique = sorted.filter((entry, index) => index === 0 || compareKeys(entry.index, sorted[index - 1]!.index) !== 0);
    if (mode === 2) return unique.slice(0, count).map((entry) => entry.row);
    const cutoff = unique[count - 1];
    return (cutoff ? sorted.filter((entry) => compareKeys(entry.index, cutoff.index) <= 0) : sorted)
      .map((entry) => entry.row);
  },
};

function sameRow(left: FormulaValue[], right: FormulaValue[]): boolean {
  return left.length === right.length && left.every((value, index) => JSON.stringify(value) === JSON.stringify(right[index]));
}
