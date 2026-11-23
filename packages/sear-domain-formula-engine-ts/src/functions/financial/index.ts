import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { ACCRINT } from './accrint';
import { ACCRINTM } from './accrintm';
import { AMORDEGRC } from './amordegrc';
import { AMORLINC } from './amorlinc';
import { COUPDAYBS } from './coupdaybs';
import { COUPDAYS } from './coupdays';
import { COUPDAYSNC } from './coupdaysnc';
import { COUPNCD } from './coupncd';
import { COUPNUM } from './coupnum';
import { COUPPCD } from './couppcd';
import { CUMIPMT } from './cumipmt';
import { CUMPRINC } from './cumprinc';
import { DB } from './db';
import { DDB } from './ddb';
import { DISC } from './disc';
import { DOLLARDE } from './dollarde';
import { DOLLARFR } from './dollarfr';
import { DURATION } from './duration';
import { EFFECT } from './effect';
import { FV } from './fv';
import { FVSCHEDULE } from './fvschedule';
import { INTRATE } from './intrate';
import { IPMT } from './ipmt';
import { IRR } from './irr';
import { ISPMT } from './ispmt';
import { MDURATION } from './mduration';
import { MIRR } from './mirr';
import { NOMINAL } from './nominal';
import { NPER } from './nper';
import { NPV } from './npv';
import { ODDFPRICE } from './oddfprice';
import { ODDFYIELD } from './oddfyield';
import { ODDLPRICE } from './oddlprice';
import { ODDLYIELD } from './oddlyield';
import { PDURATION } from './pduration';
import { PMT } from './pmt';
import { PPMT } from './ppmt';
import { PRICE } from './price';
import { PRICEDISC } from './pricedisc';
import { PRICEMAT } from './pricemat';
import { PV } from './pv';
import { RATE } from './rate';
import { RECEIVED } from './received';
import { RRI } from './rri';
import { SLN } from './sln';
import { SYD } from './syd';
import { TBILLEQ } from './tbilleq';
import { TBILLPRICE } from './tbillprice';
import { TBILLYIELD } from './tbillyield';
import { VDB } from './vdb';
import { XIRR } from './xirr';
import { XNPV } from './xnpv';
import { YIELD } from './yield';
import { YIELDDISC } from './yielddisc';
import { YIELDMAT } from './yieldmat';

export { ACCRINT } from './accrint';
export { ACCRINTM } from './accrintm';
export { AMORDEGRC } from './amordegrc';
export { AMORLINC } from './amorlinc';
export { COUPDAYBS } from './coupdaybs';
export { COUPDAYS } from './coupdays';
export { COUPDAYSNC } from './coupdaysnc';
export { COUPNCD } from './coupncd';
export { COUPNUM } from './coupnum';
export { COUPPCD } from './couppcd';
export { CUMIPMT } from './cumipmt';
export { CUMPRINC } from './cumprinc';
export { DB } from './db';
export { DDB } from './ddb';
export { DISC } from './disc';
export { DOLLARDE } from './dollarde';
export { DOLLARFR } from './dollarfr';
export { DURATION } from './duration';
export { EFFECT } from './effect';
export { FV } from './fv';
export { FVSCHEDULE } from './fvschedule';
export { INTRATE } from './intrate';
export { IPMT } from './ipmt';
export { IRR } from './irr';
export { ISPMT } from './ispmt';
export { MDURATION } from './mduration';
export { MIRR } from './mirr';
export { NOMINAL } from './nominal';
export { NPER } from './nper';
export { NPV } from './npv';
export { ODDFPRICE } from './oddfprice';
export { ODDFYIELD } from './oddfyield';
export { ODDLPRICE } from './oddlprice';
export { ODDLYIELD } from './oddlyield';
export { PDURATION } from './pduration';
export { PMT } from './pmt';
export { PPMT } from './ppmt';
export { PRICE } from './price';
export { PRICEDISC } from './pricedisc';
export { PRICEMAT } from './pricemat';
export { PV } from './pv';
export { RATE } from './rate';
export { RECEIVED } from './received';
export { RRI } from './rri';
export { SLN } from './sln';
export { SYD } from './syd';
export { TBILLEQ } from './tbilleq';
export { TBILLPRICE } from './tbillprice';
export { TBILLYIELD } from './tbillyield';
export { VDB } from './vdb';
export { XIRR } from './xirr';
export { XNPV } from './xnpv';
export { YIELD } from './yield';
export { YIELDDISC } from './yielddisc';
export { YIELDMAT } from './yieldmat';
export * from './bondPricing';
export * from './cashFlow';
export * from './couponSchedule';
export * from './dayCount';
export * from './depreciation';
export * from './rootSolver';

/** All built-in financial worksheet functions. */
export const financialFunctions: readonly FormulaFunction[] = [
  ACCRINT,
  ACCRINTM,
  AMORDEGRC,
  AMORLINC,
  COUPDAYBS,
  COUPDAYS,
  COUPDAYSNC,
  COUPNCD,
  COUPNUM,
  COUPPCD,
  CUMIPMT,
  CUMPRINC,
  DB,
  DDB,
  DISC,
  DOLLARDE,
  DOLLARFR,
  DURATION,
  EFFECT,
  FV,
  FVSCHEDULE,
  INTRATE,
  IPMT,
  IRR,
  ISPMT,
  MDURATION,
  MIRR,
  NOMINAL,
  NPER,
  NPV,
  ODDFPRICE,
  ODDFYIELD,
  ODDLPRICE,
  ODDLYIELD,
  PDURATION,
  PMT,
  PPMT,
  PRICE,
  PRICEDISC,
  PRICEMAT,
  PV,
  RATE,
  RECEIVED,
  RRI,
  SLN,
  SYD,
  TBILLEQ,
  TBILLPRICE,
  TBILLYIELD,
  VDB,
  XIRR,
  XNPV,
  YIELD,
  YIELDDISC,
  YIELDMAT,
];
