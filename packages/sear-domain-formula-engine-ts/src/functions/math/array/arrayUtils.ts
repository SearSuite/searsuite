import {
  createFormulaError,
  FormulaErrorCode,
  type EvalContext,
  type FormulaArg,
  type FormulaFunction,
  type FormulaRangeCell,
  type FormulaValue,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';
import { resolveFormulaRange } from '../../shared/helpers';
import { isBlankScalarInput } from '../../shared/blankScalarInput';
import {
  collectReferenceCells,
  isFormulaErrorValue,
  isRangeArgument,
  isRangeCell,
  matrixDimensions,
  matrixFromArg,
  numberError,
  readScalar,
  valueError,
} from '../shared/mathUtils';

type PairedCell = { value: FormulaValue; source?: FormulaRangeCell['source'] };
type PairedInput = { rows: number; columns: number; cells: PairedCell[]; directScalar: boolean };

export function pairedSumFunction(name: string, operation: (x: number, y: number) => number): FormulaFunction {
  return {
    name,
    evaluate(args, context) {
      if (args.length !== 2) return valueError();
      if (args.some((arg) => isBlankScalarInput(arg, context))) return valueError();
      const leftRange = isRangeArgument(args[0]!) ? resolveFormulaRange(args[0]!, context) : undefined;
      if (isFormulaErrorValue(leftRange)) return leftRange;
      const rightRange = isRangeArgument(args[1]!) ? resolveFormulaRange(args[1]!, context) : undefined;
      if (isFormulaErrorValue(rightRange)) return rightRange;
      if (leftRange && rightRange && !sameRangeShape(leftRange, rightRange)) {
        const leftScalarError = scalarRangeError(args[0]!, leftRange, context);
        if (leftScalarError) return leftScalarError;
        const rightScalarError = scalarRangeError(args[1]!, rightRange, context);
        if (rightScalarError) return rightScalarError;
        return createFormulaError(FormulaErrorCode.NotAvailable);
      }

      const left = pairedInput(args[0]!, context, leftRange);
      if (isFormulaErrorValue(left)) return left;
      const right = pairedInput(args[1]!, context, rightRange);
      if (isFormulaErrorValue(right)) return right;
      if (left.rows !== right.rows || left.columns !== right.columns) {
        const leftScalarError = scalarInputError(left, args[0]!);
        if (leftScalarError) return leftScalarError;
        const rightScalarError = scalarInputError(right, args[1]!);
        if (rightScalarError) return rightScalarError;
        return createFormulaError(FormulaErrorCode.NotAvailable);
      }

      let total = 0;
      for (let index = 0; index < left.cells.length; index++) {
        const x = left.cells[index]!;
        const y = right.cells[index]!;
        if (isFormulaErrorValue(x.value)) return x.value;
        if (isFormulaErrorValue(y.value)) return y.value;
        if (x.source === 'empty' || y.source === 'empty') continue;
        const xValue = left.directScalar ? readScalar([args[0]!], 0, context) : x.value;
        const yValue = right.directScalar ? readScalar([args[1]!], 0, context) : y.value;
        if (isFormulaErrorValue(xValue)) return xValue;
        if (isFormulaErrorValue(yValue)) return yValue;
        if (typeof xValue !== 'number' || typeof yValue !== 'number') continue;
        total += operation(xValue, yValue);
      }
      return total;
    },
  };
}

function sameRangeShape(left: ResolvedFormulaRange, right: ResolvedFormulaRange): boolean {
  return left.endRow - left.startRow === right.endRow - right.startRow &&
    left.endCol - left.startCol === right.endCol - right.startCol;
}

function scalarRangeError(arg: FormulaArg, range: ResolvedFormulaRange, context: EvalContext) {
  if (range.startRow !== range.endRow || range.startCol !== range.endCol) return undefined;
  const cells = collectReferenceCells(arg, context, range);
  if (isFormulaErrorValue(cells)) return cells;
  const cell = cells[0];
  const value = cell && isRangeCell(cell) ? cell.value : cell;
  return scalarInputError({
    rows: 1,
    columns: 1,
    cells: [{ value: value ?? '', source: cell && isRangeCell(cell) ? cell.source : undefined }],
    directScalar: false,
  });
}

function scalarInputError(input: PairedInput, arg?: FormulaArg) {
  if (input.cells.length !== 1) return undefined;
  const cell = input.cells[0]!;
  if (isFormulaErrorValue(cell.value)) return cell.value;
  if (cell.source === 'empty') return valueError();
  if (arg?.kind === 'value' && Array.isArray(arg.value)) return undefined;
  return typeof cell.value !== 'number' ? valueError() : undefined;
}

function pairedInput(
  arg: FormulaArg,
  context: EvalContext,
  range?: ResolvedFormulaRange | null,
): PairedInput | ReturnType<typeof valueError> {
  if (range) {
    const cells = collectReferenceCells(arg, context, range);
    if (isFormulaErrorValue(cells)) return cells;
    return {
      rows: range.endRow - range.startRow + 1,
      columns: range.endCol - range.startCol + 1,
      cells: cells.map((cell) => isRangeCell(cell)
        ? { value: cell.value, source: cell.source }
        : { value: cell }),
      directScalar: false,
    };
  }
  const matrix = matrixFromArg(arg, context);
  if (isFormulaErrorValue(matrix)) return matrix;
  const dimensions = matrixDimensions(matrix);
  if (isFormulaErrorValue(dimensions)) return dimensions;
  const [rows, columns] = dimensions;
  return {
    rows,
    columns,
    cells: matrix.flat().map((value) => ({ value })),
    directScalar: rows === 1 && columns === 1 && !(arg.kind === 'value' && Array.isArray(arg.value)),
  };
}

export function determinant(matrix: number[][]): number {
  const work = matrix.map((row) => row.slice());
  let result = 1;

  for (let pivot = 0; pivot < work.length; pivot++) {
    let pivotRow = pivot;
    for (let candidate = pivot + 1; candidate < work.length; candidate++) {
      if (Math.abs(work[candidate]![pivot]!) > Math.abs(work[pivotRow]![pivot]!)) {
        pivotRow = candidate;
      }
    }
    if (work[pivotRow]![pivot] === 0) return 0;
    if (pivotRow !== pivot) {
      [work[pivotRow], work[pivot]] = [work[pivot]!, work[pivotRow]!];
      result = -result;
    }

    const pivotValue = work[pivot]![pivot]!;
    result *= pivotValue;
    for (let row = pivot + 1; row < work.length; row++) {
      const factor = work[row]![pivot]! / pivotValue;
      for (let column = pivot + 1; column < work.length; column++) {
        work[row]![column] -= factor * work[pivot]![column]!;
      }
    }
  }
  return result;
}

export function inverseMatrix(matrix: number[][]): number[][] | ReturnType<typeof numberError> {
  const size = matrix.length;
  const work = matrix.map((row, rowIndex) => [
    ...row,
    ...Array.from({ length: size }, (_, columnIndex) => (rowIndex === columnIndex ? 1 : 0)),
  ]);

  for (let pivot = 0; pivot < size; pivot++) {
    let pivotRow = pivot;
    for (let candidate = pivot + 1; candidate < size; candidate++) {
      if (Math.abs(work[candidate]![pivot]!) > Math.abs(work[pivotRow]![pivot]!)) {
        pivotRow = candidate;
      }
    }
    if (work[pivotRow]![pivot] === 0) return numberError();
    [work[pivotRow], work[pivot]] = [work[pivot]!, work[pivotRow]!];

    const pivotValue = work[pivot]![pivot]!;
    for (let column = 0; column < size * 2; column++) work[pivot]![column] /= pivotValue;
    for (let row = 0; row < size; row++) {
      if (row === pivot) continue;
      const factor = work[row]![pivot]!;
      for (let column = 0; column < size * 2; column++) {
        work[row]![column] -= factor * work[pivot]![column]!;
      }
    }
  }
  return work.map((row) => row.slice(size).map(normalizeNumber));
}

function normalizeNumber(value: number): number {
  const nearestInteger = Math.round(value);
  if (value === nearestInteger) return nearestInteger;
  return Number(value.toPrecision(15));
}
