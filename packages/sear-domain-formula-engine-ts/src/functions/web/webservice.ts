import {
  FormulaErrorCode,
  FormulaFunctionArguments,
  FormulaServiceCacheStatus,
  FormulaWebServiceDefinition,
  FormulaWebLimits,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaWebUrl } from './isFormulaWebUrl';

/** Reads response text from a host-loaded HTTP cache. Example: WEBSERVICE("https://example.com/data.xml") returns cached XML. */
export const WEBSERVICE: FormulaFunction = {
  name: 'WEBSERVICE',
  descriptor: {
    version: 1,
    summary: 'Returns HTTP response text from a host-managed asynchronous cache.',
    category: 'Web',
    example: '=WEBSERVICE("https://example.com/data.xml")',
    parameters: [{ name: 'url', description: 'HTTP or HTTPS service URL.', accepts: ['text', 'cell'] }],
    returnKind: 'scalar',
    externalServices: [FormulaWebServiceDefinition.id],
  },
  evaluate(args, context) {
    if (args.length !== 1) return createFormulaError(FormulaErrorCode.Value);
    const url = new FormulaFunctionArguments(args, context).text(0);
    if (isFormulaError(url)) return url;
    if (!isFormulaWebUrl(url)) return createFormulaError(FormulaErrorCode.Value);
    const result = context.externalServices?.get(FormulaWebServiceDefinition)?.read(url);
    if (result?.status !== FormulaServiceCacheStatus.Ready) return createFormulaError(FormulaErrorCode.NotAvailable);
    return typeof result.value === 'string' && result.value.length > FormulaWebLimits.textLength
      ? createFormulaError(FormulaErrorCode.Value)
      : result.value;
  },
};
