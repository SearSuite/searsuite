/**
 * MUNIT: Returns an identity matrix of the requested size.
 * Example: =MUNIT(2) returns {1,0;0,1}.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { MAX_FORMULA_ARRAY_CELLS } from '../../shared/FormulaArrayLimit';
import { integerArgument, isFormulaErrorValue, numberError, valueError } from '../shared/mathUtils';

export const MUNIT: FormulaFunction = {
  name: 'MUNIT',
  evaluate(args, context): FormulaValue {
    if (args.length !== 1) return valueError();
    const size = integerArgument(args, 0, context);
    if (isFormulaErrorValue(size)) return size;
    if (size < 1 || size > 10000) return valueError();
    if (size * size > MAX_FORMULA_ARRAY_CELLS) return numberError();
    return Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)),
    );
  },
};
