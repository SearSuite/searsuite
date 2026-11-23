import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { ENCODEURL } from './encodeurl';
import { FILTERXML } from './filterxml';
import { WEBSERVICE } from './webservice';

export { ENCODEURL } from './encodeurl';
export { FILTERXML } from './filterxml';
export { WEBSERVICE } from './webservice';

export const webFunctions: readonly FormulaFunction[] = [ENCODEURL, FILTERXML, WEBSERVICE];
