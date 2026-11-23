import { type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { flatten, matrixArg, numberArg, lookupValueError } from '../../lookup/lookupHelpers';

function inverseNormal(p: number): number {
  const a = [
    -39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924,
  ];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [
    -0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878,
  ];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p > 0.97575) return -inverseNormal(1 - p);
  const q = p - 0.5,
    r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}
/** MARGINOFERROR formula. Estimates the normal confidence margin for a sample. Example: =MARGINOFERROR(0.95,A1:A10). */
export const MARGINOFERROR: FormulaFunction = {
  name: 'MARGINOFERROR',
  evaluate(args, context) {
    if (args.length !== 2) return lookupValueError();
    const confidence = numberArg(args[0], context);
    const matrix = matrixArg(args[1], context);
    if (isFormulaError(confidence)) return confidence;
    if (isFormulaError(matrix)) return matrix;
    const values = flatten(matrix).map(Number).filter(Number.isFinite);
    if (confidence <= 0 || confidence >= 1 || values.length < 2) return lookupValueError();
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
    return inverseNormal((1 + confidence) / 2) * Math.sqrt(variance / values.length);
  },
};
