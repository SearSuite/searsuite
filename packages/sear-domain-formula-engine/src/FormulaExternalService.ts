import { type FormulaExternalServiceDefinition } from './FormulaExternalServiceDefinition';
import { type FormulaExternalServiceReader } from './FormulaExternalServiceReader';

/** Editor-owned registry used by hosts to publish services and cache invalidation. */
export interface IFormulaExternalServiceProvider extends FormulaExternalServiceReader {
  enforceCommandBoundary(isCommandExecuting: () => boolean, dispatchRemoval: (id: number) => void): void;
  enforceTeardownBoundary(ownerToken: object): void;
  unregisterRegistration(id: number): void;
  register<T>(definition: FormulaExternalServiceDefinition<T>, service: T): () => void;
  invalidate<T>(definition: FormulaExternalServiceDefinition<T>): void;
  subscribeInvalidation(listener: (serviceIds: readonly string[]) => void): () => void;
  destroy(ownerToken?: object): void;
}

export namespace IFormulaExternalServiceProvider {
  export const symbol: symbol = Symbol.for('IFormulaExternalServiceProvider');
}
