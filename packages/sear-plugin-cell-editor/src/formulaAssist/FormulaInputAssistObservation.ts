import { defineStateObservation } from '@searsuite/sear-foundation-subscription';
import type { FormulaSignature, FormulaSuggestion } from './FormulaInputAnalysis';
import type { FormulaInputDiagnostic } from './diagnoseFormulaInput';

/** Current formula-authoring suggestions and caret position in the host view. */
export interface FormulaInputAssistState {
  readonly suggestions: readonly FormulaSuggestion[];
  readonly selectedIndex: number;
  readonly signature: FormulaSignature | null;
  readonly diagnostic: FormulaInputDiagnostic | null;
  readonly anchor: { readonly x: number; readonly y: number } | null;
}

export const FormulaInputAssistObservation =
  defineStateObservation<FormulaInputAssistState>('sheet.formula.inputAssist');
