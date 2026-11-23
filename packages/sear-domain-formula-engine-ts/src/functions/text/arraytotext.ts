import { FormulaNodeKind, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isBlankScalarInput } from '../shared/blankScalarInput';
import {
  arrayConstantText,
  conciseFormulaText,
  integerArg,
  isFormulaErrorValue,
  matrixArg,
  valueError,
} from './textFormat/FormulaTextValues';

/** Converts an array to concise or strict text. Example: ARRAYTOTEXT({1,"A"},1) returns "{1,\"A\"}". */
export const ARRAYTOTEXT: FormulaFunction = {
  name: 'ARRAYTOTEXT',

  evaluate(args, context) {
    if (args.length < 1 || args.length > 2) return valueError();
    if (args[0] && isBlankScalarInput(args[0], context)) return valueError();
    const matrix = matrixArg(args, 0, context);
    if (isFormulaErrorValue(matrix)) return matrix;
    if (
      (args[0]?.kind === FormulaNodeKind.Cell || args[0]?.kind === FormulaNodeKind.WorkbookCell) &&
      matrix.length === 1 &&
      matrix[0]?.length === 1 &&
      isFormulaErrorValue(matrix[0][0])
    )
      return matrix[0][0];
    const format = integerArg(args, 1, context, 0);
    if (isFormulaErrorValue(format)) return format;
    if (format !== 0 && format !== 1) return valueError();
    if (format === 1) return arrayConstantText(matrix);
    return matrix.map((row) => row.map(conciseFormulaText).join(', ')).join(', ');
  },
};
