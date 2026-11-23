import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaWebService } from './FormulaWebService';

/** Shared identity for WEBSERVICE cache registration and recalculation. */
export const FormulaWebServiceDefinition = defineFormulaExternalService<FormulaWebService>('webservice', {
  subscribeInvalidation: (service, listener) => service.subscribeInvalidation(listener),
});
