import {
  FormulaServiceCacheStatus,
  type FormulaAddInCall,
  type FormulaAddInRegistrationId,
  type FormulaAddInRegistrationRequest,
  type FormulaAddInService,
  type FormulaServiceCacheResult,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

/** Fallback when the host has not supplied native add-in procedures. */
export class UnavailableFormulaAddInService implements FormulaAddInService {
  public resolveRegistration(
    _request: FormulaAddInRegistrationRequest,
  ): FormulaServiceCacheResult<FormulaAddInRegistrationId> {
    return { status: FormulaServiceCacheStatus.Unavailable };
  }

  public call(_request: FormulaAddInCall): FormulaServiceCacheResult<FormulaValue> {
    return { status: FormulaServiceCacheStatus.Unavailable };
  }
}
