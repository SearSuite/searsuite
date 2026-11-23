import { type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { scalar, lookupValueError, toText } from '../lookup/lookupHelpers';
import { validHostname } from './validHostname';

const localPart = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;

/** ISEMAIL checks common email-address syntax without contacting a server. Example: =ISEMAIL("a@example.com") returns TRUE. */
export const ISEMAIL: FormulaFunction = {
  name: 'ISEMAIL',
  evaluate(args, context) {
    if (args.length !== 1) return lookupValueError();
    const value = scalar(args[0], context);
    if (isFormulaError(value)) return false;
    const text = toText(value);
    const at = text.indexOf('@');
    if (at < 1 || at !== text.lastIndexOf('@')) return false;
    const local = text.slice(0, at);
    return local.length <= 64 && localPart.test(local) && validHostname(text.slice(at + 1), true);
  },
};
