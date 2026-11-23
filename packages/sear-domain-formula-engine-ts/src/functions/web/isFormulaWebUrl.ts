import { FormulaWebLimits } from '@searsuite/sear-domain-formula-engine';
import { isHttpWebServiceUrl } from '@searsuite/sear-foundation-platform';

/** Basic formula syntax/length validation; network address policy belongs to the host. */
export function isFormulaWebUrl(url: string): boolean {
  return url.length <= FormulaWebLimits.urlLength && isHttpWebServiceUrl(url);
}
