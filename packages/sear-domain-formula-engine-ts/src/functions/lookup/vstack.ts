import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, lookupNAError, lookupValueError } from './lookupHelpers';
/** VSTACK joins arrays vertically. Example: =VSTACK({1,2},{3,4}). */
export const VSTACK: FormulaFunction = {
  name: 'VSTACK',
  evaluate(args, context) {
    if (args.length < 1) return lookupValueError();
    const matrices = args.map((arg) => matrixArg(arg, context, true, true));
    const invalid = matrices.find((m) => !Array.isArray(m));
    if (invalid) return invalid;
    const valid = matrices as import('@searsuite/sear-domain-formula-engine').FormulaValue[][][];
    const width = Math.max(...valid.map((m) => m[0]?.length ?? 0));
    return valid.flatMap((m) => m.map((row) => [...row, ...Array.from({ length: width - row.length }, lookupNAError)]));
  },
};
