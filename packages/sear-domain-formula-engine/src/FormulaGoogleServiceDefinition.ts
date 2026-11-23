import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaGoogleService } from './FormulaGoogleService';

/** Host-neutral service identity shared by Google-compatible cached formulas. */
export const FormulaGoogleServiceDefinition = defineFormulaExternalService<FormulaGoogleService>('formula.google', {
  subscribeInvalidation: (service, listener) => service.subscribeInvalidation?.(listener) ?? (() => void 0),
});
