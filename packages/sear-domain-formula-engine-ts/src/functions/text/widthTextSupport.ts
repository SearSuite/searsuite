import { type FormulaTextLocale } from '@searsuite/sear-domain-formula-engine';
import { SingleByteFormulaTextLocale } from './dbcsTextLocale';

export function widthTextLocale(context: { readonly textLocale?: FormulaTextLocale }): FormulaTextLocale {
  return context.textLocale ?? SingleByteFormulaTextLocale;
}
