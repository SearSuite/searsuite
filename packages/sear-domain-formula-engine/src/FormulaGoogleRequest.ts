import { type FormulaValue } from './FormulaValue';

/** Serializable request used by host-backed Google-compatible formulas. */
export interface FormulaGoogleRequest {
  readonly functionName: string;
  readonly arguments: readonly FormulaValue[];
}
