import {
  FormulaImageServiceDefinition,
  FormulaServiceCacheStatus,
  createFormulaError,
  FormulaErrorCode,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { scalar, lookupValueError } from './lookupHelpers';
/** IMAGE reads a host-managed image cache. Example: =IMAGE("https://example.com/logo.png"). */
export const IMAGE: FormulaFunction = {
  name: 'IMAGE',
  evaluate(args, context) {
    if (args.length < 1 || args.length > 5) return lookupValueError();
    const source = scalar(args[0], context);
    if (typeof source !== 'string') return lookupValueError();
    const service = context.externalServices?.get(FormulaImageServiceDefinition);
    const result = service?.read(source);
    if (!result || result.status !== FormulaServiceCacheStatus.Ready)
      return createFormulaError(FormulaErrorCode.NotAvailable);
    return result.value.source;
  },
};
