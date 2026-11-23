import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { CELL } from './cell';
import { ERROR_TYPE } from './errorType';
import { INFO } from './info';
import { ISBLANK } from './isblank';
import { ISERR } from './iserr';
import { ISERROR } from './iserror';
import { ISEVEN } from './iseven';
import { ISFORMULA } from './isformula';
import { ISBETWEEN } from './isbetween';
import { ISDATE } from './isdate';
import { ISEMAIL } from './isemail';
import { ISURL } from './isurl';
import { ISLOGICAL } from './islogical';
import { ISNA } from './isna';
import { ISNONTEXT } from './isnontext';
import { ISNUMBER } from './isnumber';
import { ISODD } from './isodd';
import { ISREF } from './isref';
import { ISTEXT } from './istext';
import { N } from './n';
import { NA } from './na';
import { SHEET } from './sheet';
import { SHEETS } from './sheets';
import { STOCKHISTORY } from './stockhistory';
import { TYPE } from './type';

export {
  CELL,
  ERROR_TYPE,
  INFO,
  ISBETWEEN,
  ISBLANK,
  ISDATE,
  ISEMAIL,
  ISERR,
  ISERROR,
  ISEVEN,
  ISFORMULA,
  ISLOGICAL,
  ISNA,
  ISNONTEXT,
  ISNUMBER,
  ISODD,
  ISREF,
  ISTEXT,
  ISURL,
  N,
  NA,
  SHEET,
  SHEETS,
  STOCKHISTORY,
  TYPE,
};
export const informationFunctions: readonly FormulaFunction[] = [
  CELL,
  ERROR_TYPE,
  INFO,
  ISBETWEEN,
  ISBLANK,
  ISDATE,
  ISEMAIL,
  ISERR,
  ISERROR,
  ISEVEN,
  ISFORMULA,
  ISLOGICAL,
  ISNA,
  ISNONTEXT,
  ISNUMBER,
  ISODD,
  ISREF,
  ISTEXT,
  ISURL,
  N,
  NA,
  SHEET,
  SHEETS,
  STOCKHISTORY,
  TYPE,
];
