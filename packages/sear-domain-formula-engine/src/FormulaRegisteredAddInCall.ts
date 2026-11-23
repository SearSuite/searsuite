import { type FormulaAddInRegistrationId } from './FormulaAddInRegistrationId';
import { type FormulaValue } from './FormulaValue';

/** Invokes a procedure previously resolved by REGISTER.ID. */
export interface FormulaRegisteredAddInCall {
  readonly kind: 'registered';
  readonly registrationId: FormulaAddInRegistrationId;
  readonly arguments: readonly FormulaValue[];
}
