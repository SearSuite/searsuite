import { defineFormulaExternalService } from './defineFormulaExternalService';
import { type FormulaHyperlinkService } from './FormulaHyperlinkService';

/** Typed identity for the host hyperlink service. */
export const FormulaHyperlinkServiceDefinition =
  defineFormulaExternalService<FormulaHyperlinkService>('formula.hyperlink');
