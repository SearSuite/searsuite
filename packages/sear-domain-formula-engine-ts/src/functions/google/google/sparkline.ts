import { isFormulaError, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { matrix, valueError } from '../runtime/googleRuntime';
/** SPARKLINE renders numeric data as a compact text sparkline. Example: =SPARKLINE({1,3,2}) returns a three-glyph trend. */
export const SPARKLINE: FormulaFunction = {
  name: 'SPARKLINE',
  evaluate(args, context) {
    if (args.length < 1 || args.length > 2) return valueError();
    const source = matrix(args, 0, context);
    if (isFormulaError(source)) return source;
    const values = source
      .flat()
      .map(number)
      .filter((value): value is number => value !== undefined);
    if (values.length === 0) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const glyphs = '▁▂▃▄▅▆▇█';
    return values.map((value) => glyphs[Math.round(((value - min) / (max - min || 1)) * (glyphs.length - 1))]).join('');
  },
};
function number(value: FormulaValue): number | undefined {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : undefined;
}
