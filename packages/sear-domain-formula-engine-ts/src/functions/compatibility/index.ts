import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { BETADIST } from './betadist';
import { BETAINV } from './betainv';
import { BINOMDIST } from './binomdist';
import { CEILING } from './ceiling';
import { CHIDIST } from './chidist';
import { CHIINV } from './chiinv';
import { CHITEST } from './chitest';
import { CONFIDENCE } from './confidence';
import { COVAR } from './covar';
import { CRITBINOM } from './critbinom';
import { EXPONDIST } from './expondist';
import { FDIST } from './fdist';
import { FINV } from './finv';
import { FLOOR } from './floor';
import { FTEST } from './ftest';
import { GAMMADIST } from './gammadist';
import { GAMMAINV } from './gammainv';
import { HYPGEOMDIST } from './hypgeomdist';
import { LOGINV } from './loginv';
import { LOGNORMDIST } from './lognormdist';
import { MODE } from './mode';
import { NEGBINOMDIST } from './negbinomdist';
import { NORM_INV } from './normInv';
import { NORMDIST } from './normdist';
import { NORMSDIST } from './normsdist';
import { NORMSINV } from './normsinv';
import { PERCENTILE } from './percentile';
import { PERCENTRANK } from './percentrank';
import { POISSON } from './poisson';
import { QUARTILE } from './quartile';
import { RANK } from './rank';
import { STDEV } from './stdev';
import { STDEVP } from './stdevp';
import { TDIST } from './tdist';
import { TINV } from './tinv';
import { TTEST } from './ttest';
import { VARP } from './varp';
import { WEIBULL } from './weibull';
import { ZTEST } from './ztest';

export {
  BETADIST,
  BETAINV,
  BINOMDIST,
  CEILING,
  CHIDIST,
  CHIINV,
  CHITEST,
  CONFIDENCE,
  COVAR,
  CRITBINOM,
  EXPONDIST,
  FDIST,
  FINV,
  FLOOR,
  FTEST,
  GAMMADIST,
  GAMMAINV,
  HYPGEOMDIST,
  LOGINV,
  LOGNORMDIST,
  MODE,
  NEGBINOMDIST,
  NORM_INV,
  NORMDIST,
  NORMSDIST,
  NORMSINV,
  PERCENTILE,
  PERCENTRANK,
  POISSON,
  QUARTILE,
  RANK,
  STDEV,
  STDEVP,
  TDIST,
  TINV,
  TTEST,
  VARP,
  WEIBULL,
  ZTEST,
};

export const compatibilityFunctions: readonly FormulaFunction[] = [
  BETADIST,
  BETAINV,
  BINOMDIST,
  CEILING,
  CHIDIST,
  CHIINV,
  CHITEST,
  CONFIDENCE,
  COVAR,
  CRITBINOM,
  EXPONDIST,
  FDIST,
  FINV,
  FLOOR,
  FTEST,
  GAMMADIST,
  GAMMAINV,
  HYPGEOMDIST,
  LOGINV,
  LOGNORMDIST,
  MODE,
  NEGBINOMDIST,
  NORM_INV,
  NORMDIST,
  NORMSDIST,
  NORMSINV,
  PERCENTILE,
  PERCENTRANK,
  POISSON,
  QUARTILE,
  RANK,
  STDEV,
  STDEVP,
  TDIST,
  TINV,
  TTEST,
  VARP,
  WEIBULL,
  ZTEST,
];
