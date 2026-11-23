import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaLanguageService } from './FormulaLanguageService';

/** Canonical service identity used by cached language formulas and their hosts. */
export const FormulaLanguageServiceDefinition = defineFormulaExternalService<FormulaLanguageService>('language', {
  subscribeInvalidation: (service, listener) => service.subscribeInvalidation?.(listener) ?? (() => void 0),
});
