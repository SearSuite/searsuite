import {
  FormulaRtdServiceDefinition,
  FormulaServiceCacheStatus,
  FormulaErrorCode,
  createFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { scalar, lookupValueError } from './lookupHelpers';
/** RTD reads a host-managed real-time data cache. Example: =RTD("provider",,"price","MSFT"). */
export const RTD: FormulaFunction = {
  name: 'RTD',
  volatile: true,
  evaluate(args, context) {
    if (args.length < 2) return lookupValueError();
    const progId = scalar(args[0], context);
    if (typeof progId !== 'string') return lookupValueError();
    const server = args[1] && args[1].kind !== 'missing' ? scalar(args[1], context) : undefined;
    if (server !== undefined && typeof server !== 'string') return lookupValueError();
    const topics = [];
    for (const arg of args.slice(2)) {
      const value = scalar(arg, context);
      if (typeof value !== 'string' && typeof value !== 'number') return lookupValueError();
      topics.push(String(value));
    }
    const service = context.externalServices?.get(FormulaRtdServiceDefinition);
    const result = service?.read(server === undefined ? { progId, topics } : { progId, server, topics });
    return !result || result.status !== FormulaServiceCacheStatus.Ready
      ? createFormulaError(FormulaErrorCode.NotAvailable)
      : result.value;
  },
};
