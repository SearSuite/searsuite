import { type ResolvedFormulaRange } from './ResolvedFormulaRange';

/** Callback used to publish dynamic formula dependency edges. */
export type FormulaDynamicDependencyRegistrar = (reference: ResolvedFormulaRange) => void;
