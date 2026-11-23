import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { CALL } from './call';
import { EUROCONVERT } from './euroconvert';
import { REGISTER_ID } from './registerId';

export { CALL } from './call';
export { EUROCONVERT } from './euroconvert';
export { REGISTER_ID } from './registerId';

export const addInFunctions: readonly FormulaFunction[] = [CALL, EUROCONVERT, REGISTER_ID];
