import { type FormulaTextLocale } from '@searsuite/sear-domain-formula-engine';
import { CjkFormulaTextLocale } from './dbcsTextLocale';

export function byteTextLocale(context: { readonly textLocale?: FormulaTextLocale }): FormulaTextLocale {
  return context.textLocale ?? CjkFormulaTextLocale;
}
