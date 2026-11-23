import { type FormulaExternalServiceDefinition } from './FormulaExternalServiceDefinition';

/** Read-only external-service view exposed during formula evaluation. */
export interface FormulaExternalServiceReader {
  get<T>(definition: FormulaExternalServiceDefinition<T>): T | undefined;
}
