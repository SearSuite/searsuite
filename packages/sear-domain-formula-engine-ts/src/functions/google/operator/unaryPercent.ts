import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { unaryNumber } from '../runtime/googleRuntime';
/** UNARY_PERCENT converts a percentage value to its decimal. Example: =UNARY_PERCENT(25) returns 0.25. */
export const UNARY_PERCENT: FormulaFunction = {
  name: 'UNARY_PERCENT',
  evaluate: (args, context) => unaryNumber(args, context, (value) => value / 100),
};
