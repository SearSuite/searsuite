import { type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { flatten, matrixArg, lookupValueError } from '../../lookup/lookupHelpers';

/** AVERAGE_WEIGHTED formula. Computes a weighted arithmetic mean. Example: =AVERAGE_WEIGHTED({10,20},{1,3}) returns 17.5. */
export const AVERAGE_WEIGHTED: FormulaFunction = {
  name: 'AVERAGE_WEIGHTED',
  evaluate(args, context) {
    if (args.length < 2 || args.length % 2 !== 0) return lookupValueError();
    const v = [];
    const w = [];
    for (let index = 0; index < args.length; index += 2) {
      const values = matrixArg(args[index], context);
      const weights = matrixArg(args[index + 1], context);
      if (isFormulaError(values)) return values;
      if (isFormulaError(weights)) return weights;
      if (values.length !== weights.length || values.some((row, rowIndex) => row.length !== weights[rowIndex]?.length))
        return lookupValueError();
      v.push(...flatten(values));
      w.push(...flatten(weights));
    }
    if (v.length === 0) return lookupValueError();
    const numbers: number[] = [];
    const parsedWeights: number[] = [];
    let valueScale = 0;
    let weightScale = 0;
    let directTotal = 0;
    let directWeight = 0;
    let lostProduct = false;
    for (let i = 0; i < v.length; i++) {
      const number = Number(v[i]);
      const currentWeight = Number(w[i]);
      if (!Number.isFinite(number) || !Number.isFinite(currentWeight) || currentWeight < 0) return lookupValueError();
      numbers.push(number);
      parsedWeights.push(currentWeight);
      valueScale = Math.max(valueScale, Math.abs(number));
      weightScale = Math.max(weightScale, currentWeight);
      const product = number * currentWeight;
      lostProduct ||= number !== 0 && currentWeight !== 0 && product === 0;
      directTotal += product;
      directWeight += currentWeight;
    }
    if (weightScale === 0) return lookupValueError();
    const directAverage = directTotal / directWeight;
    if (!lostProduct && Number.isFinite(directAverage) && Number.isFinite(directTotal) &&
      Number.isFinite(directWeight)) return directAverage;
    if (valueScale === 0) return 0;
    let normalizedTotal = 0;
    let normalizedWeight = 0;
    for (let i = 0; i < numbers.length; i++) {
      const weight = parsedWeights[i]! / weightScale;
      normalizedTotal += (numbers[i]! / valueScale) * weight;
      normalizedWeight += weight;
    }
    const average = Math.max(-1, Math.min(1, normalizedTotal / normalizedWeight));
    return valueScale * average;
  },
};
