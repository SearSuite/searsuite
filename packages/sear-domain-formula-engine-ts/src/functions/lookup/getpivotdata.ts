import {
  FormulaPivotDataServiceDefinition,
  FormulaErrorCode,
  createFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { scalar, lookupRefError, lookupValueError } from './lookupHelpers';
/** GETPIVOTDATA reads a host pivot data service. Example: =GETPIVOTDATA("Sales",A1). */
export const GETPIVOTDATA: FormulaFunction = {
  name: 'GETPIVOTDATA',
  evaluate(args, context) {
    if (args.length < 2 || args.length % 2 !== 0) return lookupValueError();
    const service = context.externalServices?.get(FormulaPivotDataServiceDefinition);
    if (!service) return lookupRefError();
    const dataField = scalar(args[0], context);
    const pivot = scalar(args[1], context);
    if (typeof dataField !== 'string' || typeof pivot === 'object') return lookupValueError();
    const filters = [];
    for (let i = 2; i < args.length; i += 2) {
      const field = scalar(args[i], context);
      const item = scalar(args[i + 1], context);
      if (typeof field !== 'string' || (typeof item !== 'string' && typeof item !== 'number'))
        return lookupValueError();
      filters.push({ field, item: String(item) });
    }
    return (
      service.getData({ dataField, pivotReference: String(pivot), filters }) ??
      createFormulaError(FormulaErrorCode.Reference)
    );
  },
};
