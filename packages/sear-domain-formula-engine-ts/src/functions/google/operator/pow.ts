import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { excelPower } from '../../../excelPower';
import { binaryNumber } from '../runtime/googleRuntime';
/** POW raises a base to an exponent. Example: =POW(2,3) returns 8. */
export const POW: FormulaFunction = {
  name: 'POW',
  evaluate: (args, context) => binaryNumber(args, context, excelPower),
};
