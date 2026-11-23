import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, lookupNAError, lookupValueError } from './lookupHelpers';
/** HSTACK joins arrays horizontally. Example: =HSTACK({1;2},{3;4}). */
export const HSTACK: FormulaFunction = {
  name: 'HSTACK',
  evaluate(args, context) {
    if (args.length < 1) return lookupValueError();
    const matrices = args.map((arg) => matrixArg(arg, context, true, true));
    const invalid = matrices.find((m) => !Array.isArray(m));
    if (invalid) return invalid;
    const valid = matrices as import('@searsuite/sear-domain-formula-engine').FormulaValue[][][];
    const rows = Math.max(...valid.map((m) => m.length));
    return Array.from({ length: rows }, (_, r) =>
      valid.flatMap((m) => m[r] ?? Array.from({ length: m[0]?.length ?? 1 }, lookupNAError)),
    );
  },
};
