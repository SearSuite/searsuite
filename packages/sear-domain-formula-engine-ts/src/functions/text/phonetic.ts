import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  type FormulaArg,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { scalarValueArg, isFormulaErrorValue } from './textFormat/FormulaTextValues';

/** Returns stored phonetic metadata for a cell. Example: PHONETIC(A1) returns its furigana when available. */
export const PHONETIC: FormulaFunction = {
  name: 'PHONETIC',

  evaluate(args, context) {
    const arg = args[0];
    if (!arg || isFormulaArgumentKind(arg, 'missing')) return createFormulaError(FormulaErrorCode.Value);
    const fallback = isFormulaArgumentKind(arg, FormulaNodeKind.Range)
      ? context.getCellValue(arg.start[0], arg.start[1])
      : isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange)
        ? context.getWorkbookCellValue?.(arg.sheetName, arg.start[0], arg.start[1]) ??
          createFormulaError(FormulaErrorCode.Reference)
        : scalarValueArg(args, 0, context);
    if (isFormulaErrorValue(fallback)) {
      if (
        isFormulaArgumentKind(arg, FormulaNodeKind.Cell) ||
        isFormulaArgumentKind(arg, FormulaNodeKind.Range) ||
        isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell) ||
        isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange) ||
        isSelectedIfReference(arg)
      ) {
        return '';
      }
      return fallback;
    }

    if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell)) {
      const phonetic = context.phoneticReader?.getCellPhonetic(arg.row, arg.col);
      if (phonetic !== undefined) return phonetic;
    } else if (isFormulaArgumentKind(arg, FormulaNodeKind.Range)) {
      const phonetic = context.phoneticReader?.getCellPhonetic(arg.start[0], arg.start[1]);
      if (phonetic !== undefined) return phonetic;
    } else if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell)) {
      const phonetic = context.phoneticReader?.getWorkbookCellPhonetic?.(arg.sheetName, arg.row, arg.col);
      if (phonetic !== undefined) return phonetic;
    } else if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange)) {
      const phonetic = context.phoneticReader?.getWorkbookCellPhonetic?.(arg.sheetName, arg.start[0], arg.start[1]);
      if (phonetic !== undefined) return phonetic;
    }

    if (isFormulaText(fallback)) return fallback.value;
    return typeof fallback === 'string' ? fallback : '';
  },
};

function isSelectedIfReference(arg: FormulaArg): boolean {
  if (!isFormulaArgumentKind(arg, 'value')) return false;
  const ast = arg.sourceAst;
  if (ast?.kind !== FormulaNodeKind.Call || ast.name.toUpperCase() !== 'IF') return false;
  const condition = ast.args[0];
  if (condition?.kind !== FormulaNodeKind.Boolean) return false;
  const branch = ast.args[condition.value ? 1 : 2];
  return (
    branch?.kind === FormulaNodeKind.Cell ||
    branch?.kind === FormulaNodeKind.WorkbookCell ||
    branch?.kind === FormulaNodeKind.Range ||
    branch?.kind === FormulaNodeKind.WorkbookRange
  );
}
