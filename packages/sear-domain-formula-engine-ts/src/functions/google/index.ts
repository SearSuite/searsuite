import type { FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { AI } from './ai/ai';
import { ARRAYFORMULA } from './array/arrayFormula';
import { SORTN } from './filter/sortn';
import { GOOGLEFINANCE } from './google/googleFinance';
import { GOOGLETRANSLATE } from './google/googleTranslate';
import { QUERY } from './google/query';
import { SPARKLINE } from './google/sparkline';
import { COUNTUNIQUE } from './math/countUnique';
import { ADD } from './operator/add';
import { DIVIDE } from './operator/divide';
import { EQ } from './operator/eq';
import { GT } from './operator/gt';
import { GTE } from './operator/gte';
import { LT } from './operator/lt';
import { LTE } from './operator/lte';
import { MINUS } from './operator/minus';
import { MULTIPLY } from './operator/multiply';
import { NE } from './operator/ne';
import { POW } from './operator/pow';
import { UMINUS } from './operator/uminus';
import { UNARY_PERCENT } from './operator/unaryPercent';
import { UPLUS } from './operator/uplus';
import { TO_DOLLARS } from './parser/toDollars';
import { TO_PERCENT } from './parser/toPercent';
import { TO_PURE_NUMBER } from './parser/toPureNumber';
import { TO_TEXT } from './parser/toText';
import { AVERAGE_WEIGHTED_DOTTED } from './statistical/averageWeighted';
import { JOIN } from './text/join';
import { SPLIT } from './text/split';
import { IMPORTDATA } from './web/importData';
import { IMPORTFEED } from './web/importFeed';
import { IMPORTHTML } from './web/importHtml';
import { IMPORTRANGE } from './web/importRange';
import { IMPORTXML } from './web/importXml';

export {
  ADD,
  AI,
  ARRAYFORMULA,
  AVERAGE_WEIGHTED_DOTTED,
  COUNTUNIQUE,
  DIVIDE,
  EQ,
  GOOGLEFINANCE,
  GOOGLETRANSLATE,
  GT,
  GTE,
  IMPORTDATA,
  IMPORTFEED,
  IMPORTHTML,
  IMPORTRANGE,
  IMPORTXML,
  JOIN,
  LT,
  LTE,
  MINUS,
  MULTIPLY,
  NE,
  POW,
  QUERY,
  SORTN,
  SPARKLINE,
  SPLIT,
  TO_DOLLARS,
  TO_PERCENT,
  TO_PURE_NUMBER,
  TO_TEXT,
  UMINUS,
  UNARY_PERCENT,
  UPLUS,
};

export const googleFunctions: readonly FormulaFunction[] = [
  AI,
  ARRAYFORMULA,
  SORTN,
  GOOGLEFINANCE,
  GOOGLETRANSLATE,
  QUERY,
  SPARKLINE,
  COUNTUNIQUE,
  ADD,
  DIVIDE,
  EQ,
  GT,
  GTE,
  LT,
  LTE,
  MINUS,
  MULTIPLY,
  NE,
  POW,
  UMINUS,
  UNARY_PERCENT,
  UPLUS,
  TO_DOLLARS,
  TO_PERCENT,
  TO_PURE_NUMBER,
  TO_TEXT,
  AVERAGE_WEIGHTED_DOTTED,
  JOIN,
  SPLIT,
  IMPORTDATA,
  IMPORTFEED,
  IMPORTHTML,
  IMPORTRANGE,
  IMPORTXML,
];
