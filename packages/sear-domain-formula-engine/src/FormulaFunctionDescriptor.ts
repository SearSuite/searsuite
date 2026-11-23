import { type FormulaFunctionParameterDescriptor } from './FormulaFunctionParameterDescriptor';

/** Versioned presentation-neutral formula function metadata. */
export interface FormulaFunctionDescriptor {
  readonly version: 1;
  readonly summary: string;
  readonly category: string;
  readonly example: string;
  readonly parameters: readonly FormulaFunctionParameterDescriptor[];
  /** Authoritative lower argument bound. Omit when a signature is illustrative only. */
  readonly minArguments?: number;
  /** Authoritative upper argument bound. Omit for variadic or illustrative signatures. */
  readonly maxArguments?: number;
  readonly returnKind?: 'scalar' | 'array' | 'scalar-or-array';
  readonly externalServices?: readonly string[];
}
