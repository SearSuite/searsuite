import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { DAVERAGE } from './daverage';
import { DCOUNT } from './dcount';
import { DCOUNTA } from './dcounta';
import { DGET } from './dget';
import { DMAX } from './dmax';
import { DMIN } from './dmin';
import { DPRODUCT } from './dproduct';
import { DSTDEV } from './dstdev';
import { DSTDEVP } from './dstdevp';
import { DSUM } from './dsum';
import { DVAR } from './dvar';
import { DVARP } from './dvarp';

export { DAVERAGE, DCOUNT, DCOUNTA, DGET, DMAX, DMIN, DPRODUCT, DSTDEV, DSTDEVP, DSUM, DVAR, DVARP };
export const databaseFunctions: readonly FormulaFunction[] = [
  DAVERAGE,
  DCOUNT,
  DCOUNTA,
  DGET,
  DMAX,
  DMIN,
  DPRODUCT,
  DSTDEV,
  DSTDEVP,
  DSUM,
  DVAR,
  DVARP,
];
