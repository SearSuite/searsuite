import { type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { scalar, lookupValueError, toText } from '../lookup/lookupHelpers';
import { validHostname } from './validHostname';

/** ISURL checks whether text is an absolute URL. Example: =ISURL("https://example.com") returns TRUE. */
export const ISURL: FormulaFunction = {
  name: 'ISURL',
  evaluate(args, context) {
    if (args.length !== 1) return lookupValueError();
    const value = scalar(args[0], context);
    if (isFormulaError(value)) return false;
    const text = toText(value);
    if (!/^(?:https?|ftp):\/\//i.test(text) || /\s/.test(text)) return false;
    try {
      const url = new URL(text);
      return Boolean(url.hostname) &&
        (url.hostname.startsWith('[') || validHostname(url.hostname, false));
    } catch {
      return false;
    }
  },
};
