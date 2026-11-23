import cases from '@searsuite-test/formula-coverage-cases';

const names = new Set([
  'ACCRINT', 'ACCRINTM', 'AMORDEGRC', 'AMORLINC', 'COUPDAYBS', 'COUPDAYS', 'COUPDAYSNC', 'COUPNCD', 'COUPNUM',
  'COUPPCD', 'CUMIPMT', 'CUMPRINC', 'DB', 'DDB', 'DISC', 'DOLLARDE', 'DOLLARFR', 'DURATION', 'EFFECT', 'FV',
  'FVSCHEDULE', 'INTRATE', 'IPMT', 'IRR', 'ISPMT', 'MDURATION', 'MIRR', 'NOMINAL', 'NPER', 'NPV', 'ODDFPRICE',
  'ODDFYIELD', 'ODDLPRICE', 'ODDLYIELD', 'PDURATION', 'PMT', 'PPMT', 'PRICE', 'PRICEDISC', 'PRICEMAT', 'PV',
  'RATE', 'RECEIVED', 'RRI', 'SLN', 'SYD', 'TBILLEQ', 'TBILLPRICE', 'TBILLYIELD', 'VDB', 'XIRR', 'XNPV', 'YIELD',
  'YIELDDISC', 'YIELDMAT',
]);

export const financialBenchmarkCases: readonly (readonly [string, string])[] = cases
  .filter(({ name }) => names.has(name))
  .map(({ name, formula }) => [name, formula] as const);
