import { type FormulaDateTimeLocale } from './FormulaDateTimeLocale';
import { type FormulaTextLocale } from './FormulaTextLocale';

/** Editor-local locale provider consumed by formula evaluation hosts. */
export interface IFormulaLocaleProvider {
  /** Returns the current date/time locale strategy for formula functions. */
  getDateTimeLocale(): FormulaDateTimeLocale;
  /** Returns the current text byte/width locale strategy for formula functions. */
  getTextLocale?(): FormulaTextLocale;
}

export namespace IFormulaLocaleProvider {
  /** DI token for resolving IFormulaLocaleProvider. */
  export const symbol = Symbol.for('IFormulaLocaleProvider');
}
