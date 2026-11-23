import { type FormulaLanguageService } from './FormulaLanguageService';
import { type FormulaPhoneticReader } from './FormulaPhoneticReader';

/** Optional editor-local providers for metadata- and service-backed text formulas. */
export interface IFormulaTextServiceProvider {
  enforceCommandBoundary?(isCommandExecuting: () => boolean, dispatchRemoval: (id: number) => void): void;
  unregisterRegistration?(id: number): void;
  getPhoneticReader?(): FormulaPhoneticReader | undefined;
  getLanguageService?(): FormulaLanguageService | undefined;
  registerPhoneticReader?(reader: FormulaPhoneticReader): () => void;
  registerLanguageService?(service: FormulaLanguageService): () => void;
  subscribeInvalidation?(listener: () => void): () => void;
}

export namespace IFormulaTextServiceProvider {
  /** DI token for host adapters that supply text-formula services. */
  export const symbol = Symbol.for('IFormulaTextServiceProvider');
}
