import {
  FormulaErrorCode,
  FormulaWebLimits,
  createFormulaError,
  type FormulaError,
  type FormulaWebService,
} from '@searsuite/sear-domain-formula-engine';
import { AsyncFormulaServiceCache } from './AsyncFormulaServiceCache';
import { isFormulaWebUrl } from './functions/web/isFormulaWebUrl';

/** Host-driven WEBSERVICE cache; loaders own HTTP status checks, cancellation, and network policy. */
export class FormulaWebServiceCache
  extends AsyncFormulaServiceCache<string, string | FormulaError>
  implements FormulaWebService
{
  public constructor(loader: (url: string) => Promise<string>, warn?: (message: string, error: unknown) => void) {
    super(async (url) => {
      if (!isFormulaWebUrl(url)) return createFormulaError(FormulaErrorCode.Value);
      try {
        const text = await loader(url);
        return text.length <= FormulaWebLimits.textLength ? text : createFormulaError(FormulaErrorCode.Value);
      } catch {
        return createFormulaError(FormulaErrorCode.Value);
      }
    }, warn);
  }
}
