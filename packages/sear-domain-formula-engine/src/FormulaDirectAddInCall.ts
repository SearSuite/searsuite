import { type FormulaAddInRegistrationRequest } from './FormulaAddInRegistrationRequest';
import { type FormulaValue } from './FormulaValue';

/** Invokes a host-authorized procedure by module signature. */
export interface FormulaDirectAddInCall extends FormulaAddInRegistrationRequest {
  readonly kind: 'direct';
  readonly typeText: string;
  readonly arguments: readonly FormulaValue[];
}
