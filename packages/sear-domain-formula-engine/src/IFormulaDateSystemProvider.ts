import type { FormulaDateSystem } from './FormulaDateSystem';

/** Editor-local source for the workbook date serial system. */
export interface IFormulaDateSystemProvider {
  getDateSystem(): FormulaDateSystem;
}

export namespace IFormulaDateSystemProvider {
  export const symbol = Symbol.for('IFormulaDateSystemProvider');
}
