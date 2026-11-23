import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaImageService } from './FormulaImageService';

/** Typed identity for the host image service. */
export const FormulaImageServiceDefinition = defineFormulaExternalService<FormulaImageService>('formula.image');
