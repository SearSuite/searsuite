import { type FormulaIterationSettings } from './FormulaIterationSettings';

/** Optional editor-local provider for circular formula calculation. */
export interface IFormulaIterationSettingsProvider {
  getSettings(): FormulaIterationSettings;
}

export namespace IFormulaIterationSettingsProvider {
  export const symbol = Symbol.for('IFormulaIterationSettingsProvider');
}
