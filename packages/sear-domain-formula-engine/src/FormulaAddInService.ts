import { type FormulaAddInCall } from './FormulaAddInCall';
import { type FormulaAddInRegistrationId } from './FormulaAddInRegistrationId';
import { type FormulaAddInRegistrationRequest } from './FormulaAddInRegistrationRequest';
import { type FormulaServiceCacheResult } from './FormulaServiceCacheResult';
import { type FormulaValue } from './FormulaValue';

/**
 * Host-owned native add-in boundary used by CALL and REGISTER.ID.
 * Implementations must enforce authorization and isolation outside formula evaluation.
 */
export interface FormulaAddInService {
  resolveRegistration(request: FormulaAddInRegistrationRequest): FormulaServiceCacheResult<FormulaAddInRegistrationId>;
  call(request: FormulaAddInCall): FormulaServiceCacheResult<FormulaValue>;
}
