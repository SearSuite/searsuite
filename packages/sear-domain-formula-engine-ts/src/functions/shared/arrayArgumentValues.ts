import {
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import {
  forEachFormulaRangeCell,
  forEachFormulaRangeCellWithMetadata,
  formulaRangeHeight,
  formulaRangeWidth,
  readArg,
  resolveFormulaRange,
} from './helpers';

export function readArrayArgument(arg: FormulaArg, context: EvalContext, emptyAsNull = false): FormulaValue {
  const ast = arg.kind === 'expression' ? arg.ast : arg;
  if (ast.kind !== FormulaNodeKind.Range && ast.kind !== FormulaNodeKind.WorkbookRange &&
      ast.kind !== FormulaNodeKind.ColumnRange && ast.kind !== FormulaNodeKind.RowRange)
    return readArg(arg, context);
  const range = resolveFormulaRange(ast, context);
  if (!range || isFormulaError(range)) return range ?? createFormulaError(FormulaErrorCode.Reference);
  const rows: FormulaValue[][] = Array.from(
    { length: formulaRangeHeight(range) },
    () => Array<FormulaValue>(formulaRangeWidth(range)).fill(null),
  );
  const error = emptyAsNull
    ? forEachFormulaRangeCellWithMetadata(range, context, (cell, row, col) => {
        rows[row]![col] = cell.source === 'empty' ? null : cell.value;
      })
    : forEachFormulaRangeCell(range, context, (value, row, col) => { rows[row]![col] = value; });
  return error ?? rows;
}

export function mapArrayValues(
  value: FormulaValue[],
  select: (value: FormulaValue, row: number, col: number) => FormulaValue,
): FormulaValue[][] {
  return value.map((row, rowIndex) =>
    (Array.isArray(row) ? row : [row]).map((cell, columnIndex) => select(cell, rowIndex, columnIndex)));
}
