import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaCubeService } from './FormulaCubeService';

/** Typed identity used to publish a host-specific CUBE implementation. */
export const FormulaCubeServiceDefinition = defineFormulaExternalService<FormulaCubeService>('formula.cube', {
  subscribeInvalidation: (service, listener) => service.subscribeInvalidation(listener),
});
