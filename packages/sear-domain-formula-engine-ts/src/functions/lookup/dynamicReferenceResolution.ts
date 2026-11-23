import {
  FormulaNodeKind,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';
import {
  booleanArg,
  lookupRefError,
  lookupValueError,
  numberArg,
  numberOrDateArg,
  resolveTextReference,
} from './lookupHelpers';
import { excelGridLimits } from './excelGridLimits';

export function resolveIndirectReference(
  args: readonly FormulaArg[],
  context: EvalContext,
): ResolvedFormulaRange | FormulaError {
  if (args.length < 1 || args.length > 2) return lookupValueError();
  const a1 = args[1] && args[1].kind !== 'missing' ? booleanArg(args[1], context, true) : true;
  if (typeof a1 !== 'boolean') return a1;
  return resolveTextReference(args[0], context, a1 ? 'A1' : 'R1C1');
}

export function resolveOffsetReference(
  args: readonly FormulaArg[],
  context: EvalContext,
  resolveBase: (arg: FormulaArg | undefined, context: EvalContext) => ResolvedFormulaRange | FormulaError | undefined,
): ResolvedFormulaRange | FormulaError {
  if (args.length < 3 || args.length > 5) return lookupValueError();
  const base = resolveBase(args[0], context);
  if (!base) return lookupValueError();
  if (isFormulaError(base)) return base;
  const rows = numberOrDateArg(args[1], context);
  const cols = numberArg(args[2], context);
  if (isFormulaError(rows)) return rows;
  if (isFormulaError(cols)) return cols;
  const height =
    args[3] && args[3].kind !== 'missing' ? numberArg(args[3], context) : base.endRow - base.startRow + 1;
  const width = args[4] && args[4].kind !== 'missing' ? numberArg(args[4], context) : base.endCol - base.startCol + 1;
  if (isFormulaError(height)) return height;
  if (isFormulaError(width)) return width;
  if (height === 0 || width === 0) return lookupRefError();
  if (height < -excelGridLimits.rows || width < -excelGridLimits.columns) return lookupRefError();
  const heightFromCell = args[3]?.kind === 'expression' && (
    args[3].ast.kind === FormulaNodeKind.Cell || args[3].ast.kind === FormulaNodeKind.WorkbookCell
  );
  // Excel and WPS resolve a sub-unit negative height from a cell as one row.
  const resolvedHeight = heightFromCell && height > -1 && height < 0 ? 1 : height;
  const anchorRow = base.startRow + Math.trunc(rows);
  const anchorCol = base.startCol + Math.trunc(cols);
  if (resolvedHeight < 0) {
    if (resolvedHeight < -(anchorRow + 1)) return lookupRefError();
    return lookupValueError();
  }
  if (width < 0) return lookupValueError();
  const rowCount = Math.trunc(resolvedHeight);
  const columnCount = Math.trunc(width);
  if (rowCount === 0 || columnCount === 0) return lookupValueError();
  const shifted = {
    ...base,
    startRow: anchorRow,
    endRow: anchorRow + rowCount - 1,
    startCol: anchorCol,
    endCol: anchorCol + columnCount - 1,
  };
  if (
    shifted.startRow < 0 ||
    shifted.startCol < 0 ||
    shifted.endRow >= excelGridLimits.rows ||
    shifted.endCol >= excelGridLimits.columns
  ) return lookupRefError();
  context.registerDynamicDependency?.(shifted);
  return shifted;
}
