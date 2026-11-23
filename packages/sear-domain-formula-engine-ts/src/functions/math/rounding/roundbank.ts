import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, readScalar, valueError } from '../shared/mathUtils';

/** ROUNDBANK rounds midpoint values to the nearest even digit. Example: =ROUNDBANK(2.5,0) returns 2. */
export const ROUNDBANK: FormulaFunction = {
  name: 'ROUNDBANK',
  evaluate(args, context) {
    if (args.length < 1 || args.length > 2) return valueError();
    const value = readScalar(args, 0, context);
    const digits = readScalar(args, 1, context, 0);
    if (isFormulaErrorValue(value)) return value;
    if (isFormulaErrorValue(digits)) return digits;
    const factor = 10 ** Math.trunc(digits);
    if (factor === 0) return 0;
    if (!Number.isFinite(factor)) return value;
    const scaled = value * factor;
    if (!Number.isFinite(scaled)) return value;
    const floor = Math.floor(scaled);
    const fraction = scaled - floor;
    const rounded = fraction === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(scaled);
    return rounded / factor;
  },
};
