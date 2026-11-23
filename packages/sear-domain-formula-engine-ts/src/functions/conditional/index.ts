export { IF } from './if';
export { IFERROR } from './iferror';
export { LET } from './let';
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { AND } from './and';
import { FALSE } from './false';
import { IFNA } from './ifna';
import { IFS } from './ifs';
import { LET } from './let';
import { NOT } from './not';
import { OR } from './or';
import { SWITCH } from './switch';
import { TRUE } from './true';
import { XOR } from './xor';

export const logicalFunctions: readonly FormulaFunction[] = [
  AND,
  FALSE,
  IFNA,
  IFS,
  LET,
  NOT,
  OR,
  SWITCH,
  TRUE,
  XOR,
];
export { AND } from './and';
export { FALSE } from './false';
export { IFNA } from './ifna';
export { IFS } from './ifs';
export { NOT } from './not';
export { OR } from './or';
export { SWITCH } from './switch';
export { TRUE } from './true';
export { XOR } from './xor';
