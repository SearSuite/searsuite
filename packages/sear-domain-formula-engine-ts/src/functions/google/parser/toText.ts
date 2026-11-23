import { FormulaFunctionArguments, isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { formatExcelText } from '@searsuite/sear-domain-format';
import { valueError } from '../runtime/googleRuntime';
/** TO_TEXT converts a scalar to text, retaining a referenced cell's number format. Example: =TO_TEXT(42) returns "42". */
export const TO_TEXT: FormulaFunction = {
  name: 'TO_TEXT',
  evaluate(args, context) {
    if (args.length !== 1) return valueError();
    const reader = new FormulaFunctionArguments(args, context);
    const reference = reader.reference(0);
    if (
      !isFormulaError(reference) &&
      reference.startRow === reference.endRow &&
      reference.startCol === reference.endCol
    ) {
      const metadata = context.metadata?.readCell({
        row: reference.startRow,
        col: reference.startCol,
        ...(reference.source.kind === 'workbookSheet' ? { sheetName: reference.source.sheetName } : {}),
      });
      if (metadata?.numberFormat) {
        const value = reader.value(0);
        if (isFormulaError(value)) return value;
        if (typeof value === 'number') {
          const text = formatExcelText(value, metadata.numberFormat);
          if (typeof text === 'string') return text;
        }
      }
    }
    return reader.text(0);
  },
};
