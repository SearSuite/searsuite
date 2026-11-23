import { type FormulaInputAssistState } from './FormulaInputAssistObservation';

/** Detaches the small formula-authoring projection from editor-owned state. */
export function cloneFormulaInputAssistState(state: FormulaInputAssistState): FormulaInputAssistState {
  return {
    suggestions: state.suggestions.map((suggestion) => ({ ...suggestion })),
    selectedIndex: state.selectedIndex,
    signature: state.signature ? {
      ...state.signature,
      descriptor: {
        ...state.signature.descriptor,
        parameters: state.signature.descriptor.parameters.map((parameter) => ({
          ...parameter,
          ...(parameter.accepts ? { accepts: [...parameter.accepts] } : {}),
        })),
        ...(state.signature.descriptor.externalServices
          ? { externalServices: [...state.signature.descriptor.externalServices] }
          : {}),
      },
    } : null,
    diagnostic: state.diagnostic ? { ...state.diagnostic } : null,
    anchor: state.anchor ? { ...state.anchor } : null,
  };
}
