import {
  isFormulaArgumentKind,
  FormulaNodeKind,
  type EvalContext,
  type FormulaArg,
  type FormulaAST,
  type FormulaError,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, valueError } from './errors';

export type FormulaMatrix = FormulaValue[][];

export function isComputedFunctionArgument(arg: FormulaArg | undefined): boolean {
  return isFormulaArgumentKind(arg, 'value') && arg.sourceKind === FormulaNodeKind.Call;
}

export function isReferenceBackedArgument(arg: FormulaArg, context: EvalContext): boolean {
  if (isReferenceNode(arg.kind) || arg.kind === 'reference') return true;
  const ast = arg.kind === 'value' ? arg.sourceAst : arg.kind === 'expression' ? arg.ast : undefined;
  return ast ? isSelectedReference(ast, context) : false;
}

function isReferenceNode(kind: FormulaNodeKind | string): boolean {
  return kind === FormulaNodeKind.Cell || kind === FormulaNodeKind.Range ||
    kind === FormulaNodeKind.WorkbookCell || kind === FormulaNodeKind.WorkbookRange ||
    kind === FormulaNodeKind.ColumnRange || kind === FormulaNodeKind.RowRange;
}

function isSelectedReference(ast: FormulaAST, context: EvalContext): boolean {
  if (isReferenceNode(ast.kind)) return true;
  if (ast.kind !== FormulaNodeKind.Call || ast.name.toUpperCase() !== 'IF') return false;
  const condition = ast.args[0] && context.evaluateFormula?.(ast.args[0]);
  if (typeof condition !== 'boolean' && typeof condition !== 'number') return false;
  const branch = ast.args[condition ? 1 : 2];
  return branch ? isSelectedReference(branch, context) : false;
}

function scalarValue(arg: FormulaArg, context: EvalContext): FormulaValue {
  if (isFormulaArgumentKind(arg, 'value')) return arg.value;
  if (isFormulaArgumentKind(arg, 'expression')) return context.evaluateArrayFormula?.(arg.ast) ?? valueError();
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell)) return context.getCellValue(arg.row, arg.col);
  if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell))
    return context.getWorkbookCellValue?.(arg.sheetName, arg.row, arg.col) ?? valueError();
  if (isFormulaArgumentKind(arg, 'reference')) return context.readReference?.(arg.reference) ?? valueError();
  return valueError();
}

export function matrixArgument(arg: FormulaArg, context: EvalContext): FormulaMatrix | FormulaError {
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Range) || isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange)) {
    const [startRow, startCol] = arg.start;
    const [endRow, endCol] = arg.end;
    const iterator = isFormulaArgumentKind(arg, FormulaNodeKind.Range)
      ? context.iterateRange(startRow, startCol, endRow, endCol)
      : context.iterateWorkbookRange?.(arg.sheetName, startRow, startCol, endRow, endCol);
    if (!iterator) return valueError();
    const width = endCol - startCol + 1;
    const rows: FormulaMatrix = [];
    let row: FormulaValue[] = [];
    for (const value of iterator) {
      row.push(value);
      if (row.length === width) {
        rows.push(row);
        row = [];
      }
    }
    return rows;
  }
  const value = scalarValue(arg, context);
  if (isFormulaError(value)) return value;
  if (!Array.isArray(value)) return [[value]];
  return value.map((row) => (Array.isArray(row) ? row : [row]));
}

export function mapArguments(
  args: readonly FormulaArg[],
  context: EvalContext,
  operation: (values: readonly FormulaValue[]) => FormulaValue,
): FormulaValue {
  const matrices = args.map((arg) => matrixArgument(arg, context));
  const error = matrices.find(isFormulaError);
  if (error) return error;
  const values = matrices as FormulaMatrix[];
  const rows = Math.max(...values.map((matrix) => matrix.length));
  const columns = Math.max(...values.flatMap((matrix) => matrix.map((row) => row.length)));
  for (const matrix of values) {
    const matrixColumns = Math.max(...matrix.map((row) => row.length));
    if (matrix.length !== 1 && matrix.length !== rows) return valueError();
    if (matrixColumns !== 1 && matrixColumns !== columns) return valueError();
  }
  const result = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) =>
      operation(values.map((matrix) => matrix[matrix.length === 1 ? 0 : row]![matrix[0]!.length === 1 ? 0 : column]!)),
    ),
  );
  return rows === 1 && columns === 1 ? result[0]![0]! : result;
}

export function numeric(value: FormulaValue): number | FormulaError {
  if (isFormulaError(value)) return value;
  if (value === null) return valueError();
  if (Array.isArray(value) || (typeof value === 'object' && value !== null && value.kind !== 'text'))
    return valueError();
  if (typeof value === 'boolean') return value ? 1 : 0;
  const raw = typeof value === 'object' ? value.value : value;
  if (typeof raw === 'string' && raw.trim() === '') return valueError();
  const result = Number(raw);
  return Number.isFinite(result) ? result : valueError();
}

export function text(value: FormulaValue): string | FormulaError {
  if (isFormulaError(value)) return value;
  if (value === null) return '';
  if (Array.isArray(value) || (typeof value === 'object' && value !== null && value.kind !== 'text'))
    return valueError();
  if (typeof value === 'object') return value.value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}
