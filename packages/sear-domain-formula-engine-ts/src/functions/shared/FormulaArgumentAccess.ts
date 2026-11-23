import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

export function readArg(arg: FormulaArg, context: EvalContext): FormulaValue {
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell)) return context.getCellValue(arg.row, arg.col);
  if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell))
    return (
      context.getWorkbookCellValue?.(arg.sheetName, arg.row, arg.col) ?? createFormulaError(FormulaErrorCode.Reference)
    );
  if (isFormulaArgumentKind(arg, 'value')) return arg.value;
  if (isFormulaArgumentKind(arg, 'expression'))
    return context.evaluateFormula?.(arg.ast) ?? createFormulaError(FormulaErrorCode.Value);
  if (isFormulaArgumentKind(arg, 'reference'))
    return context.readReference?.(arg.reference) ?? createFormulaError(FormulaErrorCode.Value);
  return createFormulaError(FormulaErrorCode.Value);
}

export function readLazyArg(arg: FormulaArg, context: EvalContext): FormulaValue {
  return readArg(arg, context);
}

export function scalarValue(value: FormulaValue): FormulaValue {
  return Array.isArray(value) ? createFormulaError(FormulaErrorCode.Value) : value;
}
