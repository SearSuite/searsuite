import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { FormulaErrorCode, createFormulaError, type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';

const documentedStatisticsFunctions = [
  'AVEDEV',
  'AVERAGE',
  'AVERAGEA',
  'AVERAGEIF',
  'AVERAGEIFS',
  'BETA.DIST',
  'BETA.INV',
  'BINOM.DIST',
  'BINOM.DIST.RANGE',
  'BINOM.INV',
  'CHISQ.DIST',
  'CHISQ.DIST.RT',
  'CHISQ.INV',
  'CHISQ.INV.RT',
  'CHISQ.TEST',
  'CONFIDENCE.NORM',
  'CONFIDENCE.T',
  'CORREL',
  'COUNT',
  'COUNTA',
  'COUNTBLANK',
  'COUNTIF',
  'COUNTIFS',
  'COVARIANCE.P',
  'COVARIANCE.S',
  'DEVSQ',
  'EXPON.DIST',
  'F.DIST',
  'F.DIST.RT',
  'F.INV',
  'F.INV.RT',
  'F.TEST',
  'FISHER',
  'FISHERINV',
  'FORECAST',
  'FORECAST.ETS',
  'FORECAST.ETS.CONFINT',
  'FORECAST.ETS.SEASONALITY',
  'FORECAST.ETS.STAT',
  'FORECAST.LINEAR',
  'FREQUENCY',
  'GAMMA',
  'GAMMA.DIST',
  'GAMMA.INV',
  'GAMMALN',
  'GAMMALN.PRECISE',
  'GAUSS',
  'GEOMEAN',
  'GROWTH',
  'HARMEAN',
  'HYPGEOM.DIST',
  'INTERCEPT',
  'KURT',
  'LARGE',
  'LINEST',
  'LOGEST',
  'LOGNORM.DIST',
  'LOGNORM.INV',
  'MAX',
  'MAXA',
  'MAXIFS',
  'MEDIAN',
  'MIN',
  'MINA',
  'MINIFS',
  'MODE.MULT',
  'MODE.SNGL',
  'NEGBINOM.DIST',
  'NORM.DIST',
  'NORM.S.DIST',
  'NORM.S.INV',
  'NORMINV',
  'PEARSON',
  'PERCENTILE.EXC',
  'PERCENTILE.INC',
  'PERCENTRANK.EXC',
  'PERCENTRANK.INC',
  'PERMUT',
  'PERMUTATIONA',
  'PHI',
  'POISSON.DIST',
  'PROB',
  'QUARTILE.EXC',
  'QUARTILE.INC',
  'RANK.AVG',
  'RANK.EQ',
  'RSQ',
  'SKEW',
  'SKEW.P',
  'SLOPE',
  'SMALL',
  'STANDARDIZE',
  'STDEV.P',
  'STDEV.S',
  'STDEVA',
  'STDEVPA',
  'STEYX',
  'T.DIST',
  'T.DIST.2T',
  'T.DIST.RT',
  'T.INV',
  'T.INV.2T',
  'T.TEST',
  'TREND',
  'TRIMMEAN',
  'VAR.P',
  'VAR.S',
  'VARA',
  'VARPA',
  'WEIBULL.DIST',
  'Z.TEST',
] as const;

const markdownTestCaseIds = [
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 72, 73, 74, 85, 86, 87, 88, 117, 118, 119, 120, 121, 122, 123,
  163, 164, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 198, 199, 200, 201, 202, 203, 204, 281,
  337, 338, 341, 342, 343, 344, 345, 346, 373, 374, 393, 394, 399, 400, 401, 402, 403, 404, 405, 409, 410, 411, 416,
  427, 428, 429, 462, 463, 520, 595, 599, 600, 610, 611, 612, 624, 625, 626, 640, 641, 642, 643, 649, 650, 657, 658,
  659, 660, 670, 671, 683, 684, 694, 695, 697, 698, 699, 702, 737, 738, 744, 745, 746, 747, 748, 749, 750, 751, 752,
  753, 754, 755, 771, 772, 786, 787, 796, 797, 798, 811, 812, 813, 814, 870, 913, 914, 916, 917, 918, 927, 929, 930,
  931, 933, 934, 977, 978, 979, 980, 981, 982, 983, 1062, 1064, 1092, 1093, 1094, 1095, 1096, 1099, 1100, 1129, 1130,
  1158, 1159, 1160, 1161,
] as const;

const functionSmokeFormulas: ReadonlyArray<readonly [string, string]> = [
  ['AVEDEV', '=AVEDEV({4,5,6,7,5,4,3})'],
  ['AVERAGE', '=AVERAGE({1,2,3})'],
  ['AVERAGEA', '=AVERAGEA(1,TRUE,"2")'],
  ['AVERAGEIF', '=AVERAGEIF({1,2,3},">1")'],
  ['AVERAGEIFS', '=AVERAGEIFS({10,20,30},{1,2,3},">1")'],
  ['BETA.DIST', '=BETA.DIST(2,8,10,TRUE,1,3)'],
  ['BETA.INV', '=BETA.INV(0.685470581,8,10,1,3)'],
  ['BINOM.DIST', '=BINOM.DIST(6,10,0.5,FALSE)'],
  ['BINOM.DIST.RANGE', '=BINOM.DIST.RANGE(60,0.75,45,50)'],
  ['BINOM.INV', '=BINOM.INV(6,0.5,0.75)'],
  ['CHISQ.DIST', '=CHISQ.DIST(0.5,1,TRUE)'],
  ['CHISQ.DIST.RT', '=CHISQ.DIST.RT(18.307,10)'],
  ['CHISQ.INV', '=CHISQ.INV(0.93,1)'],
  ['CHISQ.INV.RT', '=CHISQ.INV.RT(0.05,10)'],
  ['CHISQ.TEST', '=CHISQ.TEST({58,35;11,25;10,23},{45.35,47.65;17.56,18.44;16.09,16.91})'],
  ['CONFIDENCE.NORM', '=CONFIDENCE.NORM(0.05,2.5,50)'],
  ['CONFIDENCE.T', '=CONFIDENCE.T(0.05,1,50)'],
  ['CORREL', '=CORREL({1,2,3},{2,4,6})'],
  ['COUNT', '=COUNT({1,"x",2},TRUE)'],
  ['COUNTA', '=COUNTA({1,"",TRUE})'],
  ['COUNTBLANK', '=COUNTBLANK({1,"";"",2})'],
  ['COUNTIF', '=COUNTIF({"A","B","A"},"A")'],
  ['COUNTIFS', '=COUNTIFS({"A";"A";"B"},"A",{1;2;3},">1")'],
  ['COVARIANCE.P', '=COVARIANCE.P({2,4,8},{5,11,12})'],
  ['COVARIANCE.S', '=协方差。S({2,4,8},{5,11,12})'],
  ['DEVSQ', '=DEVSQ({4,5,8,7})'],
  ['EXPON.DIST', '=EXPON.DIST(0.2,10,TRUE)'],
  ['F.DIST', '=F.DIST(15.2069,6,4,TRUE)'],
  ['F.DIST.RT', '=F.DIST.RT(15.2069,6,4)'],
  ['F.INV', '=F.INV(0.5,5,2)'],
  ['F.INV.RT', '=F.INV.RT(0.01,6,4)'],
  ['F.TEST', '=F.TEST({1,2,3},{1,2,4})'],
  ['FISHER', '=FISHER(0.75)'],
  ['FISHERINV', '=FISHERINV(0.972955)'],
  ['FORECAST', '=FORECAST(4,{2,4,6},{1,2,3})'],
  ['FORECAST.ETS', '=FORECAST.ETS(4,{2,4,6},{1,2,3})'],
  ['FORECAST.ETS.CONFINT', '=FORECAST.ETS.CONFINT(4,{2,4,6},{1,2,3})'],
  ['FORECAST.ETS.SEASONALITY', '=FORECAST.ETS.SEASONALITY({2,4,6},{1,2,3})'],
  ['FORECAST.ETS.STAT', '=FORECAST.ETS.STAT({2,4,6},{1,2,3},1)'],
  ['FORECAST.LINEAR', '=FORECAST.LINEAR(4,{2,4,6},{1,2,3})'],
  ['FREQUENCY', '=FREQUENCY({1,2,3,4},{2,3})'],
  ['GAMMA', '=GAMMA(2.5)'],
  ['GAMMA.DIST', '=GAMMA.DIST(10,9,2,TRUE)'],
  ['GAMMA.INV', '=GAMMA.INV(0.068094,9,2)'],
  ['GAMMALN', '=GAMMALN(4)'],
  ['GAMMALN.PRECISE', '=GAMMALN.PRECISE(4)'],
  ['GAUSS', '=GAUSS(2)'],
  ['GEOMEAN', '=GEOMEAN({4,5,8,7,11,4,3})'],
  ['GROWTH', '=GROWTH({2,4,8},{1,2,3},{4})'],
  ['HARMEAN', '=HARMEAN({4,5,8,7,11,4,3})'],
  ['HYPGEOM.DIST', '=HYPGEOM.DIST(1,4,8,20,FALSE)'],
  ['INTERCEPT', '=INTERCEPT({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})'],
  ['KURT', '=KURT({3,4,5,2,3,4,5,6,4,7})'],
  ['LARGE', '=LARGE({3,5,1,4},2)'],
  ['LINEST', '=LINEST({2,4,6},{1,2,3})'],
  ['LOGEST', '=LOGEST({2,4,8},{1,2,3})'],
  ['LOGNORM.DIST', '=LOGNORM.DIST(4,3.5,1.2,TRUE)'],
  ['LOGNORM.INV', '=LOGNORM.INV(0.039084,3.5,1.2)'],
  ['MAX', '=MAX({1,2,3})'],
  ['MAXA', '=MAXA(1,TRUE,"2")'],
  ['MAXIFS', '=MAXIFS({10,20,30},{1,2,3},">1")'],
  ['MEDIAN', '=MEDIAN({1,2,3,4})'],
  ['MIN', '=MIN({1,2,3})'],
  ['MINA', '=MINA(1,FALSE,"2")'],
  ['MINIFS', '=MINIFS({10,20,30},{1,2,3},">1")'],
  ['MODE.MULT', '=MODE.MULT({1,1,2,2,3})'],
  ['MODE.SNGL', '=MODE.SNGL({1,1,2,3})'],
  ['NEGBINOM.DIST', '=NEGBINOM.DIST(10,5,0.25,FALSE)'],
  ['NORM.DIST', '=NORM.DIST(42,40,1.5,TRUE)'],
  ['NORM.S.DIST', '=NORM.S.DIST(1.333333,TRUE)'],
  ['NORM.S.INV', '=NORM.S.INV(0.908789)'],
  ['NORMINV', '=NORMINV(0.908789,40,1.5)'],
  ['PEARSON', '=PEARSON({9,7,5,3,1},{10,6,1,5,3})'],
  ['PERCENTILE.EXC', '=PERCENTILE.EXC({1,2,3,4,5},0.5)'],
  ['PERCENTILE.INC', '=PERCENTILE.INC({1,2,3,4},0.3)'],
  ['PERCENTRANK.EXC', '=PERCENTRANK.EXC({1,2,3,6,6,6,7,8,9},5.43)'],
  ['PERCENTRANK.INC', '=PERCENTRANK.INC({1,2,3,4},3)'],
  ['PERMUT', '=PERMUT(4,3)'],
  ['PERMUTATIONA', '=PERMUTATIONA(4,3)'],
  ['PHI', '=PHI(1)'],
  ['POISSON.DIST', '=POISSON.DIST(2,5,TRUE)'],
  ['PROB', '=PROB({1,2,3},{0.2,0.3,0.5},2,3)'],
  ['QUARTILE.EXC', '=QUARTILE.EXC({1,2,3,4,5},2)'],
  ['QUARTILE.INC', '=QUARTILE.INC({1,2,3,4,5},1)'],
  ['RANK.AVG', '=RANK.AVG(3,{1,2,3,3,4},1)'],
  ['RANK.EQ', '=RANK.EQ(3,{1,2,3,3,4},1)'],
  ['RSQ', '=RSQ({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})'],
  ['SKEW', '=SKEW({3,4,5,2,3,4,5,6,4,7})'],
  ['SKEW.P', '=SKEW.P({3,4,5,2,3,4,5,6,4,7})'],
  ['SLOPE', '=SLOPE({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})'],
  ['SMALL', '=SMALL({3,5,1,4},2)'],
  ['STANDARDIZE', '=STANDARDIZE(42,40,1.5)'],
  ['STDEV.P', '=STDEV.P({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})'],
  ['STDEV.S', '=STDEV.S({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})'],
  ['STDEVA', '=STDEVA({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})'],
  ['STDEVPA', '=STDEVPA({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})'],
  ['STEYX', '=STEYX({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})'],
  ['T.DIST', '=T.DIST(60,1,TRUE)'],
  ['T.DIST.2T', '=T.DIST.2T(1.96,60)'],
  ['T.DIST.RT', '=T.DIST.RT(1.96,60)'],
  ['T.INV', '=T.INV(0.75,2)'],
  ['T.INV.2T', '=T.INV.2T(0.546449,60)'],
  ['T.TEST', '=T.TEST({3,4,5,8,9,1,2,4,5},{6,19,3,2,14,4,5,17,1},2,1)'],
  ['TREND', '=TREND({2,4,6},{1,2,3},{4,5})'],
  ['TRIMMEAN', '=TRIMMEAN({4,5,6,7,2,3,4,5,1,2,3},0.2)'],
  ['VAR.P', '=VAR.P({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})'],
  ['VAR.S', '=VAR.S({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})'],
  ['VARA', '=VARA({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})'],
  ['VARPA', '=VARPA({1345,1301,1368,1322,1310,1370,1318,1350,1303,1299})'],
  ['WEIBULL.DIST', '=WEIBULL.DIST(105,20,100,TRUE)'],
  ['Z.TEST', '=Z.TEST({3,6,7,8,6,5,4,2,1,9},4)'],
];

function createContext(data: Record<string, FormulaValue> = {}, shape: [number, number] = [200, 50]): EvalContext {
  return {
    isCellInBounds: (row, column) => row >= 0 && row < shape[0] && column >= 0 && column < shape[1],
    getSheetShape: () => shape,
    getCellValue: (row, column) => data[`${row},${column}`] ?? 0,
    *iterateRange(startRow, startColumn, endRow, endColumn) {
      for (let row = startRow; row <= endRow; row++) {
        for (let column = startColumn; column <= endColumn; column++) {
          yield data[`${row},${column}`] ?? 0;
        }
      }
    },
    *iterateRangeCells(startRow, startColumn, endRow, endColumn) {
      for (let row = startRow; row <= endRow; row++) {
        for (let column = startColumn; column <= endColumn; column++) {
          const key = `${row},${column}`;
          yield {
            row,
            col: column,
            value: data[key] ?? 0,
            source: Object.prototype.hasOwnProperty.call(data, key) ? 'value' : 'empty',
          } as const;
        }
      }
    },
    random: () => 0.5,
  };
}

function evaluate(formula: string, data: Record<string, FormulaValue> = {}, shape?: [number, number]): FormulaValue {
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
  return evaluator.evaluate(new FormulaParser().parse(formula), createContext(data, shape));
}

function expectClose(actual: FormulaValue, expected: number, digits = 6): void {
  expect(typeof actual).toBe('number');
  expect(actual as number).toEqual(expect.closeTo(expected, digits));
}

describe('statistics formula coverage', () => {
  it('BUG-222 distinguishes an empty criteria cell from numeric zero', () => {
    const data: Record<string, FormulaValue> = {
      '9,3': 0,
      '11,3': 1,
      '9,4': 10,
      '10,4': 20,
      '11,4': 30,
    };
    expect(evaluate('=COUNTIF(D10:D12,"")', data)).toBe(1);
    expect(evaluate('=COUNTIF(D10:D12,"<>")', data)).toBe(2);
    expect(evaluate('=SUMIF(D10:D12,"",E10:E12)', data)).toBe(20);
    expect(evaluate('=AVERAGEIF(D10:D12,"",E10:E12)', data)).toBe(20);
    expect(evaluate('=COUNTIF(D10:D10,0)', data)).toBe(1);
  });

  it('BUG-223 compares text criteria lexically', () => {
    expect(evaluate('=COUNTIF({"apple","pear","zebra"},">m")')).toBe(2);
    expect(evaluate('=COUNTIF({"apple","pear","zebra"},"<m")')).toBe(1);
    expect(evaluate('=SUMIF({"apple","pear","zebra"},">m",{10,20,30})')).toBe(50);
    expect(evaluate('=COUNTIF({1,2,3},">2")')).toBe(1);
  });

  it('BUG-224 matches an error cell with its error code as text criteria', () => {
    const data: Record<string, FormulaValue> = {
      '22,1': { kind: 'error', code: FormulaErrorCode.DivisionByZero },
    };
    expect(evaluate('=COUNTIF(B23:B23,"#DIV/0!")', data)).toBe(1);
    expect(evaluate('=COUNTIF(B23:B23,"#NUM!")', data)).toBe(0);
  });

  it('BUG-225/1013 counts error-valued criteria by matching error codes', () => {
    const data: Record<string, FormulaValue> = {
      '22,1': { kind: 'error', code: FormulaErrorCode.DivisionByZero },
    };
    expect(evaluate('=COUNTIF(B23:B23,B23)', data)).toBe(1);
    expect(evaluate('=COUNTIF(B23:B23,IF(TRUE,B23,0))', data)).toBe(1);
    expect(evaluate('=COUNTIFS(B23:B23,B23,B23:B23,"#DIV/0!")', data)).toBe(1);
    expect(evaluate('=COUNTIFS({1;2},1/0)')).toBe(0);
    expect(evaluate('=COUNTIF(B23:B23,"#DIV/0!")', data)).toBe(1);
  });

  it('BUG-226 keeps base-prefixed and leading-zero text distinct from numbers', () => {
    expect(evaluate('=COUNTIF({16,"0x10"},"0x10")')).toBe(1);
    expect(evaluate('=SUMIF({16,"0x10"},"0x10",{10,20})')).toBe(20);
    expect(evaluate('=COUNTIF({2,"0b10"},"0b10")')).toBe(1);
    expect(evaluate('=COUNTIF({"1";"01"},"01")')).toBe(1);
    expect(evaluate('=COUNTIF({16,"0x10"},16)')).toBe(1);
  });

  it('BUG-986 matches numeric cells against leading-zero SUMIF criteria', () => {
    expect(evaluate('=SUMIF({1;2},"001",{7;11})')).toBe(7);
    expect(evaluate('=COUNTIF({1;2},"001")')).toBe(1);
    expect(evaluate('=SUMIF(A1:A2,A3,B1:B2)', {
      '0,0': 1, '1,0': 2, '2,0': '001', '0,1': 7, '1,1': 11,
    })).toBe(7);
    expect(evaluate('=COUNTIF({"1";"01"},"01")')).toBe(1);
  });

  it('BUG-229 includes numeric values that do not match a negated text wildcard', () => {
    expect(evaluate('=COUNTIF({1,"a",2},"<>a*")')).toBe(2);
    expect(evaluate('=SUMIF({1,"a",2},"<>a*",{10,20,30})')).toBe(40);
    expect(evaluate('=COUNTIF({1,"a",2},"a*")')).toBe(1);
  });

  it('BUG-366 only treats tilde as an escape before a wildcard or another tilde', () => {
    expect(evaluate('=COUNTIF({"~a"},"~a")')).toBe(1);
    expect(evaluate('=COUNTIF({"a"},"~a")')).toBe(0);
    expect(evaluate('=SUMIF({"~a";"a"},"~a",{10;20})')).toBe(10);
    expect(evaluate('=COUNTIF({"*"},"~*")')).toBe(1);
    expect(evaluate('=COUNTIF({"~"},"~~")')).toBe(1);
  });

  it('BUG-411 lets text wildcards span cell-internal newlines', () => {
    const data: Record<string, FormulaValue> = {
      '142,1': 'a\nb', '143,1': 'ab', '142,0': 5, '143,0': 7,
    };
    expect(evaluate('=COUNTIF(B143:B143,"*")', data)).toBe(1);
    expect(evaluate('=COUNTIF(B144:B144,"*")', data)).toBe(1);
    expect(evaluate('=SUMIF(B143:B144,"*",A143:A144)', data)).toBe(12);
    expect(evaluate('=COUNTIF(B143:B143,"A*B")', data)).toBe(1);
  });

  it('BUG-367 excludes nonmatching error criteria regardless of condition order', () => {
    const data: Record<string, FormulaValue> = {
      '50,0': 1, '51,0': 2,
      '50,1': { kind: 'error', code: FormulaErrorCode.DivisionByZero }, '51,1': 5,
    };
    expect(evaluate('=SUMIFS(A51:A52,B51:B52,">0")', data)).toBe(2);
    expect(evaluate('=SUMIFS(A51:A52,B51:B52,">0",A51:A52,">1")', data)).toBe(2);
    expect(evaluate('=SUMIFS(A51:A52,A51:A52,">1",B51:B52,">0")', data)).toBe(2);
  });

  it('BUG-409 expands a short AVERAGEIF average range from its top-left cell', () => {
    const data: Record<string, FormulaValue> = {
      '132,0': 1, '133,0': 2, '134,0': 3,
      '132,1': 10, '133,1': 20, '134,1': 30,
    };
    expect(evaluate('=AVERAGEIF(A133:A135,">1",B133)', data)).toBe(25);
    expect(evaluate('=AVERAGEIF(A133:A135,">1",B133:B135)', data)).toBe(25);
    expect(evaluate('=SUMIF(A133:A135,">1",B133)', data)).toBe(50);
  });

  it('BUG-410 propagates a matched error from average and extremum ranges', () => {
    const data: Record<string, FormulaValue> = {
      '104,0': 1, '105,0': 2, '106,0': 3,
      '104,1': 1, '105,1': { kind: 'error', code: FormulaErrorCode.NotAvailable }, '106,1': 2,
    };
    for (const formula of [
      '=AVERAGEIF(A105:A107,2,B105:B107)',
      '=AVERAGEIFS(B105:B107,A105:A107,2)',
      '=MAXIFS(B105:B107,A105:A107,2)',
      '=MINIFS(B105:B107,A105:A107,2)',
      '=SUMIFS(B105:B107,A105:A107,2)',
    ]) expect(evaluate(formula, data)).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('BUG-424 propagates an error in MAXIFS and MINIFS criteria', () => {
    for (const name of ['MAXIFS', 'MINIFS', 'AVERAGEIFS', 'SUMIFS']) {
      expect(evaluate(`=${name}({10;20},{1;2},1/0)`))
        .toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    }
  });

  it('treats an error-valued cell criterion as a matchable value in conditional statistics', () => {
    const data: Record<string, FormulaValue> = {
      '0,0': { kind: 'error', code: FormulaErrorCode.Reference },
      '1,0': 2, '2,0': 3,
      '0,1': 5, '1,1': 6, '2,1': 7,
    };
    for (const name of ['MAXIFS', 'MINIFS']) {
      expect(evaluate(`=${name}(A1:A3,B1:B3,A1)`, data)).toBe(0);
      expect(evaluate(`=${name}(A1:A3,B1:B3,IF(TRUE,A1,0))`, data)).toBe(0);
    }
    expect(evaluate('=SUMIFS(A1:A3,B1:B3,A1)', data)).toBe(0);
    expect(evaluate('=SUMIFS(A1:A3,B1:B3,IF(TRUE,A1,0))', data)).toBe(0);
    expect(evaluate('=SUMIF(B1:B3,A1,A1:A3)', data)).toBe(0);
    expect(evaluate('=SUMIF(B1:B3,IF(TRUE,A1,0),A1:A3)', data)).toBe(0);
    expect(evaluate('=AVERAGEIFS(A1:A3,B1:B3,A1)', data))
      .toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=MAXIFS(A1:A3,B1:B3,6)', data)).toBe(2);
    expect(evaluate('=MINIFS(A1:A3,B1:B3,6)', data)).toBe(2);
  });

  it('BUG-691 preserves a reference error in a SUMIFS criteria range', () => {
    expect(evaluate('=SUMIFS(A1:A3,INDIRECT("NOT_A_REF"),">0")'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
    for (const name of ['SUMIF', 'COUNTIFS', 'AVERAGEIFS']) {
      const formula = name === 'SUMIF'
        ? '=SUMIF(INDIRECT("NOT_A_REF"),">0",A1:A3)'
        : name === 'COUNTIFS'
        ? '=COUNTIFS(INDIRECT("NOT_A_REF"),">0")'
        : '=AVERAGEIFS(A1:A3,INDIRECT("NOT_A_REF"),">0")';
      expect(evaluate(formula)).toEqual({ kind: 'error', code: FormulaErrorCode.Reference });
    }
  });

  it('counts text cells as zero in paired TTEST samples', () => {
    const data = { '0,0': '', '1,0': 1, '2,0': 2 };
    expectClose(evaluate('=TTEST(A1:A3,{1,2,4},2,1)', data, [3, 1]), 0.0571909584179366, 12);
    expectClose(evaluate('=TTEST(A1:A3,{1,2,4},2,1)', { ...data, '0,0': '001' }, [3, 1]),
      0.0571909584179366, 12);
    expect(evaluate('=TTEST("",{1,2,4},2,1)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('reports WPS scalar errors before mismatched T.TEST and TTEST arrays', () => {
    expect(evaluate('=T.TEST("",{1,2,4},2,1)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=T.TEST(A1,{1,2,4},2,1)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=TTEST("",{1,2,4},2,1)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('reports zero degrees of freedom for a one-item t confidence interval', () => {
    expect(evaluate('=CONFIDENCE.T(0.05,1,1.6256)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=CONFIDENCE.T(0.05,1,0)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('classifies PROB scalar content before mismatched input lengths', () => {
    expect(evaluate('=PROB(TRUE,{0.2,0.3,0.5},2,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PROB({1,2,3},FALSE,2,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PROB({"1"},{0.2,0.3,0.5},2,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=PROB({TRUE},{0.2,0.3,0.5},2,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('returns division error for a nonnumeric single-cell Z.TEST sample', () => {
    expect(evaluate('=Z.TEST(A1,49)', { '0,0': '1' }))
      .toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=Z.TEST(A1,49)', { '0,0': true }))
      .toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=Z.TEST(A1,49)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
  });

  it('prioritizes invalid INTERCEPT scalar text over a shape mismatch', () => {
    const data = { '0,0': 1, '1,0': 2, '2,0': 3 };
    expect(evaluate('=INTERCEPT(A1:A3,"abc")', data, [3, 1]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=INTERCEPT(A1:A3," a ")', data, [3, 1]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=INTERCEPT(A1:A3,FALSE)', data, [3, 1]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=INTERCEPT(A1:A3,TRUE)', data, [3, 1]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('truncates negative binomial counts before probability evaluation', () => {
    expectClose(evaluate('=NEGBINOM.DIST(1.1252,5,0.25,FALSE)'), 0.003662109375, 12);
    expect(evaluate('=NEGBINOM.DIST(10,0.5,0.25,FALSE)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=NEGBINOM.DIST(-0.5,5,0.25,FALSE)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('ignores empty cells in F.TEST sample ranges', () => {
    const first = [4, 11, -1, 6, -6, 1, 8, -4];
    const second = [10, -2, 5, 12, 0, 7, -5, 2];
    const data: Record<string, FormulaValue> = {};
    for (let index = 0; index < first.length; index++) {
      data[`${index},0`] = first[index]!;
      data[`${index},2`] = second[index]!;
    }
    expect(evaluate('=F.TEST(A1:A100,C1:C100)', data, [100, 3])).toBe(1);
    expect(evaluate('=F.TEST(A1,C1:C100)', data, [100, 3])).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=F.TEST(A1,C1:C100)', { ...data, '0,0': '' }, [100, 3]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
  });

  it('computes the right Student-t tail for negative arguments', () => {
    const negative = evaluate('=T.DIST.RT(-1,60)');
    const positive = evaluate('=T.DIST.RT(1,60)');
    expect(typeof negative).toBe('number');
    expect(typeof positive).toBe('number');
    expect((negative as number) + (positive as number)).toBeCloseTo(1, 12);
  });
  it('returns zero for unmatched MAXIFS and MINIFS criteria, including error references', () => {
    expect(evaluate('=MAXIFS({1,2,3},{1,2,3},4)')).toBe(0);
    expect(evaluate('=MINIFS({1,2,3},{1,2,3},4)')).toBe(0);
    const error = { kind: 'error' as const, code: FormulaErrorCode.Reference };
    const data = { '0,0': error, '0,2': 1, '1,2': 1, '2,2': 1 };
    expect(evaluate('=MAXIFS(A1:A3,C1:C3,A1)', data)).toBe(0);
    expect(evaluate('=MINIFS(A1:A3,C1:C3,A1)', data)).toBe(0);
  });

  it('validates ETS argument counts, vector inputs, and optional errors', () => {
    const names = ['FORECAST.ETS', 'FORECAST.ETS.CONFINT'];
    const data = { '0,0': 1, '0,1': 2, '1,0': 3, '1,1': 4 };
    for (const name of names) {
      expect(evaluate(`=${name}({2,4,6},{1,2,3})`)).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
      expect(evaluate(`=${name}(4,A1:B2,{1,2,3})`, data)).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
      expect(evaluate(`=${name}(4,{2,4,6},{1,2,3},A1)`, { '0,0': createFormulaError(FormulaErrorCode.Name) }))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    }
    expect(evaluate('=FORECAST.ETS.SEASONALITY({1,2,3})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    expect(evaluate('=FORECAST.ETS.SEASONALITY(A1:B2,{1,2,3})', data))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    expect(evaluate('=FORECAST.ETS.SEASONALITY(1,{1,2,3})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=FORECAST.ETS.STAT({1,2,3},1)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    expect(evaluate('=FORECAST.ETS.STAT(1,{1,2,3},1)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=FORECAST.ETS.STAT({2,4,6},{1,2,3},A1)', { '0,0': createFormulaError(FormulaErrorCode.Name) }))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    expect(evaluate('=FORECAST.ETS.SEASONALITY({2,4,6},{1,2,3},"a,b")'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FORECAST.ETS.SEASONALITY({2,4,6},{1,2,3},-1.2503)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=FORECAST.ETS.STAT({2,4,6},{1,2,3},"TRUE")'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FORECAST.ETS.STAT({2,4,6},{1,2,3},1,"a,b")'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('rejects invalid ETS statistic types', () => {
    for (const type of [0, 9, 1.5]) {
      expect(evaluate(`=FORECAST.ETS.STAT({1;4;2;8;3;7;1;9},{1;2;3;4;5;6;7;8},${type})`))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    }
    expect(evaluate('=FORECAST.ETS.STAT({1;4;2;8;3;7;1;9},{1;2;3;4;5;6;7;8},8)'))
      .not.toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('forecasts a detected two-period cycle and accepts explicit seasonality', () => {
    const values = '{1;10;1;10;1;10;1;10}';
    const timeline = '{1;2;3;4;5;6;7;8}';
    expect(evaluate(`=FORECAST.ETS.SEASONALITY(${values},${timeline})`)).toBe(2);
    expect(evaluate(`=FORECAST.ETS(9,${values},${timeline},2)`)).toBeCloseTo(1, 8);
    expect(evaluate(`=FORECAST.ETS(10,${values},${timeline})`)).toBeCloseTo(10, 8);
    expect(typeof evaluate(`=FORECAST.ETS(9,${values},${timeline},0)`)).toBe('number');
  });

  it('reports fitted ETS errors and horizon-aware confidence widths', () => {
    const values = '{1;4;2;8;3;7;1;9}';
    const timeline = '{1;2;3;4;5;6;7;8}';
    const mae = evaluate(`=FORECAST.ETS.STAT(${values},${timeline},6)`);
    const rmse = evaluate(`=FORECAST.ETS.STAT(${values},${timeline},7)`);
    expect(typeof mae).toBe('number');
    expect(typeof rmse).toBe('number');
    expect(rmse as number).toBeGreaterThanOrEqual(mae as number);
    expect(mae as number).toBeGreaterThan(0);
    const narrow = evaluate(`=FORECAST.ETS.CONFINT(9,${values},${timeline},0.5)`);
    const wide = evaluate(`=FORECAST.ETS.CONFINT(9,${values},${timeline},0.95)`);
    const farther = evaluate(`=FORECAST.ETS.CONFINT(10,${values},${timeline},0.95)`);
    expect(wide as number).toBeGreaterThan(narrow as number);
    expect(farther as number).toBeGreaterThan(wide as number);
  });

  it('rejects date text in T distribution inputs', () => {
    const cells = { '0,0': '2024-02-29' };
    for (const formula of [
      '=T.DIST(A1,60,TRUE)',
      '=T.DIST(60,A1,TRUE)',
      '=T.DIST.2T(A1,60)',
      '=T.DIST.RT(A1,60)',
    ]) {
      expect(evaluate(formula, cells)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
  });

  it('reports nonnumeric known X cells as value errors in growth and trend', () => {
    const data = { '0,0': '001', '0,1': 1, '0,2': 2 };
    expect(evaluate('=GROWTH({2,4,8},A1:C1,{4})', data))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=TREND({2,4,6},A1:C1,{4,5})', data))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('rejects blank scalar probability values selected through IF', () => {
    expect(evaluate('=PROB(IF(TRUE,A1,0),{0.2,0.3,0.5},2,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PROB("",{0.2,0.3,0.5},2,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PROB({1,2,3},"text",2,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PROB("001",{0.2,0.3,0.5},2,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PROB(TRUE,{0.2,0.3,0.5},2,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('checks quartile bounds before truncating the quartile index', () => {
    expect(evaluate('=QUARTILE.INC({1,2,3},-0.2502)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=QUARTILE.INC({1,2,3},0.9)')).toBe(1);
    expect(evaluate('=QUARTILE.INC({1,2,3},4.1255)')).toBe(3);
  });

  it('rejects direct nonnumeric FREQUENCY bins and data', () => {
    expect(evaluate('=FREQUENCY("1",{2;3})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FREQUENCY({-1;0;2;3},FALSE)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FREQUENCY({-1;0;2;3},"1")'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FREQUENCY({-1;0;2;3},"text")'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('registers every statistical function listed in the markdown specification', () => {
    const registry = new FunctionRegistry();
    expect(documentedStatisticsFunctions).toHaveLength(111);
    expect(markdownTestCaseIds).toHaveLength(167);
    for (const name of documentedStatisticsFunctions) expect(registry.has(name)).toBe(true);
    expect(registry.has('VAR')).toBe(true);
  });

  it('coerces date text in CONFIDENCE and rejects blank MODE scalar input', () => {
    expectClose(evaluate('=CONFIDENCE(0.05,"2024-02-29",50)'), 12570.424867616444, 8);
    expect(evaluate('=MODE(A1,1,2,3)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=MODE.MULT(A1)')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('reports an overflowing lognormal inverse as a numeric error', () => {
    expect(evaluate('=LOGINV(0.5,"2024-02-29",1.2)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('treats nonnumeric referenced FREQUENCY bins as zero and skips selected blank data', () => {
    const data = { '0,0': 'text', '1,0': -1, '2,0': 0, '3,0': 2 };
    expect(evaluate('=FREQUENCY(A1:A4,A1)', data)).toEqual([[2], [1]]);
    expect(evaluate('=FREQUENCY(A1:A4,IF(TRUE,A1,0))', data)).toEqual([[2], [1]]);
    expect(evaluate('=FREQUENCY(IF(TRUE,A1,0),{25;50;75})')).toEqual([[0], [0], [0], [0]]);
  });

  it('returns FREQUENCY counts in the original bin order', () => {
    const data = {
      '0,0': 2.675, '1,0': 1, '2,0': 2, '3,0': 9,
      '4,0': -3, '5,0': 4, '6,0': 11, '7,0': -1,
    };
    expect(evaluate('=FREQUENCY(A1:A8,A1:A3)', data)).toEqual([[1], [3], [1], [3]]);
  });

  it('skips blank referenced FREQUENCY bins without adding output buckets', () => {
    const data = { '9,3': 0, '11,3': 1 };
    expect(evaluate('=FREQUENCY({1,2,3},D10:D12)', data, [12, 4])).toEqual([[0], [1], [2]]);
    expect(evaluate('=FREQUENCY({1,2,3},D10:D12)', { ...data, '10,3': 0.5 }, [12, 4]))
      .toEqual([[0], [0], [1], [2]]);
  });

  it('rejects a nonnumeric scalar FREQUENCY bin', () => {
    expect(evaluate('=FREQUENCY({1,2,3},"text")'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('keeps a Boolean cell in a multi-cell bin range as an empty output bucket', () => {
    const data = {
      '0,0': false, '1,0': 1, '2,0': 6, '3,0': -6,
      '4,0': 1, '5,0': 8, '6,0': -4, '7,0': 3,
      '0,1': 2, '1,1': 3,
    };
    expect(evaluate('=FREQUENCY(A1:A8,A1)', data)).toEqual([[2], [5]]);
    expect(evaluate('=FREQUENCY(A1:A8,A1:B2)', data)).toEqual([[0], [0], [4], [1], [2]]);
  });

  it('keeps Boolean COUNTIF criteria distinct from Boolean-looking text', () => {
    const data: Record<string, FormulaValue> = {
      '0,0': { kind: 'text', value: 'FALSE', numericCoercion: 'allow' },
      '1,0': false,
    };
    expect(evaluate('=COUNTIF(A1:A2,A1)', data)).toBe(1);
    expect(evaluate('=COUNTIF(A1:A2,"FALSE")', data)).toBe(1);
    expect(evaluate('=COUNTIF(A1:A1,A1)', data)).toBe(0);
  });

  it('truncates BINOM.DIST successes and trials before evaluating the distribution', () => {
    expectClose(evaluate('=BINOM.DIST(1.1252,10,0.5,FALSE)'), 0.009765625, 12);
    expectClose(evaluate('=BINOM.DIST(6,6.125,0.5,FALSE)'), 0.015625, 12);
    expectClose(evaluate('=BINOM.DIST(1.6256,10,0.5,TRUE)'), 0.0107421875, 12);
    expect(evaluate('=BINOM.DIST(-0.5,10,0.5,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=BINOM.DIST(-1e-12,10,0.5,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('ignores empty referenced cells in A-series variance and deviation', () => {
    const data = { '0,0': 4, '1,0': 11, '2,0': -1, '3,0': 6, '4,0': -6, '5,0': 1, '6,0': 8, '7,0': -4 };
    expectClose(evaluate('=VARPA(A1:A100)', data), 30.734375, 12);
    expectClose(evaluate('=STDEVPA(A1:A100)', data), 5.54385921538417, 12);
    expect(evaluate('=VARPA(A9)', data)).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=VARPA(IF(TRUE,A9,0))', data)).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=VARPA("")', data)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=VARPA("1.5")', data)).toBe(0);
  });

  it('rejects nonnumeric direct text but counts referenced text in A-series aggregates', () => {
    expect(evaluate('=AVERAGEA("1.5")')).toBe(1.5);
    expect(evaluate('=MAXA("2024-02-29")')).toBe(45351);
    expect(evaluate('=MINA("001")')).toBe(1);
    expect(evaluate('=AVERAGEA("abc")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=MAXA("")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=MINA("TRUE")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=AVERAGEA(A1)', { '0,0': 'abc' })).toBe(0);
    expect(evaluate('=MAXA(A1)', { '0,0': 'abc' })).toBe(0);
    for (const name of ['AVERAGEA', 'MAXA', 'MINA', 'STDEVA', 'STDEVPA', 'VARA', 'VARPA']) {
      expect(evaluate('=' + name + '(1,"x")')).toEqual({ kind: 'error', code: '#VALUE!' });
    }
    expect(evaluate('=AVERAGEA(1,"")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=AVERAGEA(1,A1)', { '0,0': 'x' })).toBe(0.5);
  });

  it('preserves selected references and direct-text errors in AVERAGE', () => {
    expect(evaluate('=AVERAGE(IF(TRUE,A1,0))')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=AVERAGE(IF(TRUE,A1,0))', { '0,0': true })).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=AVERAGE(IF(TRUE,A1,0))', { '0,0': '1.5' })).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=AVERAGE(IF(TRUE,A1,0))', { '0,0': 2 })).toBe(2);
    expect(evaluate('=AVERAGE("")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=AVERAGE("TRUE")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=AVERAGE("2024-02-29")')).toBe(45351);
  });

  it('coerces scalar QUARTILE data and truncates its quart parameter', () => {
    expect(evaluate('=QUARTILE(TRUE,1)')).toBe(1);
    expect(evaluate('=QUARTILE("1.5",1)')).toBe(1.5);
    expect(evaluate('=QUARTILE("",1)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=QUARTILE(IF(TRUE,A1,0),1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=QUARTILE({1,2,3,4,5},0.5)')).toBe(1);
    expect(evaluate('=QUARTILE({1,2,3,4,5},2.675)')).toBe(3);
  });

  it('keeps generated statistics formulas one formula per file with examples', () => {
    const statisticsDir = join(__dirname, '../src/functions/math/statistics');
    const files = readdirSync(statisticsDir).filter(
      (file) => file.endsWith('.ts') && !['index.ts', 'StatisticsRuntime.ts', 'statisticalInput.ts', 'regressionInputShape.ts', 'forecastEtsInput.ts', 'forecastEtsModel.ts', 'multipleRegression.ts', 'centralMoments.ts'].includes(file),
    );
    expect(files).toHaveLength(112);
    for (const file of files) {
      const source = readFileSync(join(statisticsDir, file), 'utf8');
      expect(source.match(/export const /g) ?? []).toHaveLength(1);
      expect(source).toContain('Example: =');
      expect(source).toContain('formula.');
    }
    expect(existsSync(join(__dirname, '../src/functions/math/aggregation/average.ts'))).toBe(true);
    expect(existsSync(join(__dirname, '../src/functions/math/aggregation/count.ts'))).toBe(true);
  });

  it.each(functionSmokeFormulas)('evaluates a smoke example for %s', (_name, formula) => {
    const actual = evaluate(formula);
    expect(actual).not.toEqual({ kind: 'error', code: '#NAME?' });
    expect(actual).not.toEqual({ kind: 'error', code: '#VALUE!' });
  });
});

describe('statistics formula markdown and common scenarios', () => {
  it('counts error criteria and preserves selected error references', () => {
    const error = createFormulaError(FormulaErrorCode.DivisionByZero);
    const data = { '0,0': error, '1,0': 2, '0,1': 1, '1,1': 2 };
    expect(evaluate('=COUNTIF(A1:A2,A1)', data)).toBe(1);
    expect(evaluate('=COUNTIFS(A1:A2,A1,B1:B2,">0")', data)).toBe(1);
    expect(evaluate('=COUNTIF(IF(TRUE,A1,0),">50")', data)).toBe(0);
    expect(evaluate('=AVERAGEIF(IF(TRUE,A1,0),">50")', data)).toEqual(
      createFormulaError(FormulaErrorCode.DivisionByZero),
    );
  });

  it('distinguishes direct values from selected cell references in aggregates', () => {
    const error = createFormulaError(FormulaErrorCode.DivisionByZero);
    expect(evaluate('=COUNT("2024-02-29")')).toBe(1);
    expect(evaluate('=COUNT(IF(TRUE,A1,0))', { '0,0': error })).toBe(0);
    expect(evaluate('=COUNTA("")')).toBe(1);
    expect(evaluate('=COUNTA(A1)', { '0,0': '' })).toBe(1);
    expect(evaluate('=COUNTA(IF(TRUE,A1,0))')).toBe(0);
    expect(evaluate('=COUNTBLANK(IF(TRUE,A1,0))')).toBe(1);
    expect(evaluate('=COUNTBLANK(IF(TRUE,A1,0))', { '0,0': error })).toBe(0);
    expect(evaluate('=MAX(TRUE)')).toBe(1);
    expect(evaluate('=MIN("1.5")')).toBe(1.5);
    expect(evaluate('=MEDIAN("0")')).toBe(0);
    expect(evaluate('=STDEV.P(TRUE,2,3)')).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect(evaluate('=VAR.P("0",2,3)')).toBeCloseTo(14 / 9, 12);
    expect(evaluate('=COUNTBLANK()')).toEqual({ kind: 'error', code: '#VALUE!' });
  });
  it('returns exact gamma logarithm zeros and rejects empty text', () => {
    expect(evaluate('=GAMMALN(1)')).toBe(0);
    expect(evaluate('=GAMMALN.PRECISE(2)')).toBe(0);
    expect(evaluate('=GAMMALN("")')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('rejects invalid direct text in skewness and kurtosis', () => {
    expect(evaluate('=KURT("")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=SKEW("abc")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=SKEW({1,2,3,4},"a,b")')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('preserves regression argument errors and exact exponential coefficients', () => {
    expect(evaluate('=LOGEST({2,4,8},{1,2,3})')).toEqual([[2, 1]]);
    expect(evaluate('=LOGEST({2,4,8},{1,2,3},"a,b")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=LINEST({2,4,6},{1,2,3},"a,b")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=LOGEST({2,4,8},{1,2,3},A1)', { '0,0': createFormulaError(FormulaErrorCode.Name) }))
      .toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=LOGEST(A1:C1,{1,2,3})', { '0,0': '001', '0,1': 1, '0,2': 2 }))
      .toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('reports a blank scalar before mismatched paired range lengths', () => {
    const values = { '0,2': 1, '1,2': 2, '2,2': 3 };
    expect(evaluate('=CORREL(A1,C1:C3)', values)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=COVAR(A1,C1:C3)', values)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=SLOPE(A1,C1:C3)', values)).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('reports a nonnumeric scalar before mismatched paired range lengths', () => {
    const values = { '0,0': 'abc', '0,2': 1, '1,2': 2, '2,2': 3 };
    expect(evaluate('=CORREL("abc",C1:C3)', values)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=COVARIANCE.P(A1,C1:C3)', values)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=SLOPE(TRUE,C1:C3)', values)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CORREL("1",C1:C3)', values)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CORREL(1,C1:C3)', values)).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=CORREL({"1"},C1:C3)', values)).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=CORREL({TRUE},C1:C3)', values)).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('distinguishes empty references from boolean scalars in covariance size mismatches', () => {
    const values = { '0,2': 1, '1,2': 2, '2,2': 3 };
    for (const name of ['COVARIANCE.P', 'COVARIANCE.S']) {
      expect(evaluate(`=${name}(A1,C1:C3)`, values)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(TRUE,C1:C3)`, values)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(IF(TRUE,A1,0),C1:C3)`, { ...values, '0,0': true }))
        .toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(A1,C1:C3)`, { ...values, '0,0': true }))
        .toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(IF(TRUE,A1,0),C1:C3)`, values))
        .toEqual({ kind: 'error', code: '#VALUE!' });
    }
  });

  it('reports expression scalars against longer RSQ and STEYX ranges', () => {
    const values = { '0,2': 1, '1,2': 2, '2,2': 3, '0,0': true };
    for (const name of ['RSQ', 'STEYX']) {
      expect(evaluate(`=${name}(TRUE,C1:C3)`, values)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(IF(TRUE,A1,0),C1:C3)`, values))
        .toEqual({ kind: 'error', code: '#VALUE!' });
    }
  });

  it('validates literal LINEST and LOGEST predictors before shape mismatches', () => {
    for (const [name, values] of [['LINEST', '{2,4,6}'], ['LOGEST', '{2,4,8}']]) {
      expect(evaluate(`=${name}(${values},FALSE)`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(${values},"1")`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(${values},1)`)).toEqual({ kind: 'error', code: '#REF!' });
    }
  });

  it('evaluates gamma exactly at positive integers and across negative noninteger inputs', () => {
    expect(evaluate('=GAMMA(1)')).toBe(1);
    expect(evaluate('=GAMMA(10)')).toBe(362880);
    expect(evaluate('=GAMMA(-0.5)')).toBeCloseTo(-3.544907701811032, 12);
    expect(evaluate('=GAMMA(0)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('handles zero mean in Poisson distributions', () => {
    expect(evaluate('=POISSON(2,0,TRUE)')).toBe(1);
    expect(evaluate('=POISSON(2,0,FALSE)')).toBe(0);
    expect(evaluate('=POISSON.DIST(0,0,FALSE)')).toBe(1);
    expect(evaluate('=POISSON.DIST(1,0,TRUE)')).toBe(1);
    expect(evaluate('=POISSON(2,-1,TRUE)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('truncates Poisson event counts before evaluating the density', () => {
    expect(evaluate('=POISSON.DIST(1.9,2,FALSE)')).toBeCloseTo(0.2706705664732254, 14);
    expect(evaluate('=POISSON.DIST(1.9,2,FALSE)')).toBe(evaluate('=POISSON.DIST(1,2,FALSE)'));
    expect(evaluate('=POISSON.DIST(1.9,2,TRUE)')).toBe(evaluate('=POISSON.DIST(1,2,TRUE)'));
  });

  it('validates binomial counts after truncating fractional inputs', () => {
    expect(evaluate('=BINOM.DIST(1.9,1.1,0.5,FALSE)')).toBeCloseTo(0.5, 14);
    expect(evaluate('=BINOM.DIST(1,1,0.5,FALSE)')).toBeCloseTo(0.5, 14);
    expect(evaluate('=BINOM.DIST.RANGE(1.1,0.5,1.9)')).toBeCloseTo(0.5, 14);
    expect(evaluate('=BINOM.DIST.RANGE(1,0.5,1)')).toBeCloseTo(0.5, 14);
    expect(evaluate('=BINOM.DIST(2.1,1.9,0.5,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('validates binomial inverse probability endpoints', () => {
    expect(evaluate('=BINOM.INV(3,0,0.5)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=BINOM.INV(3,1,0.5)')).toBe(3);
    expect(evaluate('=BINOM.INV(3,0.5,0)')).toBe(0);
    expect(evaluate('=BINOM.INV(3,0.5,1)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('BUG-998 rejects logical and numeric-text probability inputs', () => {
    const invalid = { kind: 'error', code: FormulaErrorCode.Number };
    for (const probability of ['FALSE', '"1"', '"001"']) {
      expect(evaluate(`=BINOM.INV(6,${probability},0.75)`)).toEqual(invalid);
    }
    expect(evaluate('=BINOM.INV(6,B100,0.75)', { '99,1': false })).toEqual(invalid);
    expect(evaluate('=BINOM.INV(6,B100,0.75)', { '99,1': '1' })).toEqual(invalid);
    expect(evaluate('=BINOM.INV(6,0,0.75)')).toEqual(invalid);
    expect(evaluate('=BINOM.INV(6,1,0.75)')).toBe(6);
  });

  it('BUG-1009 rejects zero success probability and unit cumulative threshold', () => {
    const invalid = { kind: 'error', code: FormulaErrorCode.Number };
    for (const name of ['BINOM.INV', 'CRITBINOM']) {
      expect(evaluate(`=${name}(6,0,0.75)`)).toEqual(invalid);
      expect(evaluate(`=${name}(6,A1,0.75)`, { '0,0': 0 })).toEqual(invalid);
      expect(evaluate(`=${name}(6,IF(TRUE,A1,0),0.75)`, { '0,0': 0 })).toEqual(invalid);
      expect(evaluate(`=${name}(6,0.5,1)`)).toEqual(invalid);
      expect(evaluate(`=${name}(6,0.5,A1)`, { '0,0': 1 })).toEqual(invalid);
      expect(evaluate(`=${name}(6,0.5,0.75)`)).toBe(4);
      expect(evaluate(`=${name}(6,1,0.75)`)).toBe(6);
    }
  });

  it('keeps negative binomial results finite at success probability one', () => {
    expect(evaluate('=NEGBINOM.DIST(0,1,1,FALSE)')).toBe(1);
    expect(evaluate('=NEGBINOM.DIST(0,1,1,TRUE)')).toBe(1);
    expect(evaluate('=NEGBINOM.DIST(1,1,1,TRUE)')).toBe(1);
    expect(evaluate('=NEGBINOM.DIST(1,1,1,FALSE)')).toBe(0);
  });

  it('evaluates beta density at finite endpoints', () => {
    expect(evaluate('=BETA.DIST(0,1,1,FALSE)')).toBe(1);
    expect(evaluate('=BETA.DIST(1,1,1,FALSE)')).toBe(1);
    expect(evaluate('=BETA.DIST(0.5,1,1,FALSE)')).toBe(1);
    expect(evaluate('=BETA.DIST(1,2,1,FALSE)')).toBe(2);
    expect(evaluate('=BETA.DIST(0,1,2,FALSE)')).toBe(2);
    expect(evaluate('=BETA.DIST(0,0.5,1,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=BETA.DIST(1,1,0.5,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('reports a numeric error for nonfinite Weibull density at zero', () => {
    expect(evaluate('=WEIBULL.DIST(0,0.5,1,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=WEIBULL.DIST(0,1,1,FALSE)')).toBe(1);
    expect(evaluate('=WEIBULL.DIST(0,2,1,FALSE)')).toBe(0);
    expect(evaluate('=WEIBULL.DIST(0,0.5,1,TRUE)')).toBe(0);
  });

  it('preserves tiny positive inputs in chi-square and F densities', () => {
    expect(evaluate('=CHISQ.DIST(1E-20,1,FALSE)')).toBeCloseTo(3.98942280401433e9, 2);
    expect(evaluate('=CHISQ.DIST(1E-12,1,FALSE)')).toBeCloseTo(398942.2804012336, 6);
    expect(evaluate('=F.DIST(1E-20,1,2,FALSE)')).toBeCloseTo(3.53553390593274e9, 2);
    expect(evaluate('=F.DIST(1E-12,1,2,FALSE)')).toBeCloseTo(353553.39059301, 6);
    expect(evaluate('=CHISQ.DIST(0,2,FALSE)')).toBe(0.5);
    expect(evaluate('=F.DIST(0,2,2,FALSE)')).toBe(1);
  });

  it('keeps the chi-square cumulative result independent of an undefined density at zero', () => {
    expect(evaluate('=CHISQ.DIST(0,1,TRUE)')).toBe(0);
    expect(evaluate('=CHISQ.DIST(0,1,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=CHISQ.DIST(0,2,FALSE)')).toBe(0.5);
  });

  it('rejects zero expected frequencies in chi-square tests', () => {
    expect(evaluate('=CHISQ.TEST({1,2},{0,3})')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=CHISQ.TEST({0,2},{0,3})')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=CHISQ.TEST({1,2},{1,3})')).toBeCloseTo(0.563702861650773, 12);
  });

  it('coerces date text in numeric statistics arguments', () => {
    expect(evaluate('=NORM.S.DIST("2024-02-29",TRUE)')).toBe(1);
  });

  it('returns the WPS numeric error for extreme standard normal inputs', () => {
    expect(evaluate('=NORM.S.DIST(-1E12,TRUE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=NORM.S.DIST(1E15,TRUE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=NORMSDIST(-1E15)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('propagates a referenced error before rejecting regression input shape', () => {
    const nameError = createFormulaError(FormulaErrorCode.Name);
    expect(evaluate('=FORECAST.LINEAR(4,{2,4,6},A1)', { '0,0': nameError })).toEqual(nameError);
  });

  it('rejects mismatched regression ranges before their cell errors', () => {
    const numberError = createFormulaError(FormulaErrorCode.Number);
    expect(evaluate('=INTERCEPT(A1:B2,C1:C100)', { '0,0': numberError })).toEqual(
      createFormulaError(FormulaErrorCode.NotAvailable),
    );
  });

  it('matches representative markdown golden examples', () => {
    expectClose(evaluate('=BETA.DIST(2,8,10,TRUE,1,3)'), 0.6854706);
    expectClose(evaluate('=BINOM.DIST.RANGE(60,0.75,45,50)'), 0.52363, 3);
    expectClose(evaluate('=CHISQ.TEST({58,35;11,25;10,23},{45.35,47.65;17.56,18.44;16.09,16.91})'), 0.0003082);
    expectClose(evaluate('=GAMMA.DIST(10,9,2,TRUE)'), 0.0680936);
    expectClose(evaluate('=KURT({3,4,5,2,3,4,5,6,4,7})'), -0.151799637);
    expectClose(evaluate('=STEYX({2,3,9,1,8,7,5},{6,5,11,7,5,4,4})'), 3.305719);
    expectClose(evaluate('=T.TEST({3,4,5,8,9,1,2,4,5},{6,19,3,2,14,4,5,17,1},2,1)'), 0.196016);
    expectClose(evaluate('=WEIBULL.DIST(105,20,100,TRUE)'), 0.929581);
    expectClose(evaluate('=Z.TEST({3,6,7,8,6,5,4,2,1,9},4)'), 0.090574);
  });

  it('preserves ZTEST scalar provenance and finite standard errors', () => {
    expect(evaluate('=ZTEST(A1,4)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=ZTEST(-1000000000000000,4)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=ZTEST("",4)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=ZTEST(TRUE,4)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=ZTEST({3,6,7,8},4,-1)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('uses the WPS single-precision sample root only for legacy ZTEST', () => {
    expectClose(evaluate('=ZTEST({3,6,7,8,6,5,4,2,1,9},4)'), 0.0905741942055116, 12);
    expectClose(evaluate('=ZTEST({3,6,7,8,6,5,4,2,1,9},6)'), 0.863043392038762, 12);
    expectClose(evaluate('=Z.TEST({3,6,7,8,6,5,4,2,1,9},4)'), 0.0905741968513638, 12);
    const cells = { '0,0': -60, '1,0': 1, '2,0': 2 };
    expectClose(evaluate('=ZTEST(A1:A3,4)', cells, [3, 1]), 0.869034757482861, 12);
    cells['0,0'] = -59;
    expectClose(evaluate('=ZTEST(A1:A3,4)', cells, [3, 1]), 0.869462046200777, 12);
  });

  it('handles TRIMMEAN scalar inputs and empty samples', () => {
    expect(evaluate('=TRIMMEAN(TRUE,0.2)')).toBe(1);
    expect(evaluate('=TRIMMEAN("1.5",0.2)')).toBe(1.5);
    expect(evaluate('=TRIMMEAN("",0.2)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TRIMMEAN(A1,0.2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=TRIMMEAN({"text"},0.2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=TRIMMEAN({1,2,3},"FALSE")')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('uses integer chi-square degrees and coerces scalar distribution inputs', () => {
    expectClose(evaluate('=CHISQ.DIST(0.5,2.8752,TRUE)'), 0.221199216928595, 12);
    expect(evaluate('=CHISQ.DIST(0.5,0.875,TRUE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=CHISQ.DIST("",1,TRUE)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CHISQ.DIST(0.5,"2024-02-29",TRUE)')).toBe(0);
    expectClose(evaluate('=CHISQ.DIST(0.5,1,A1)', { '0,0': 'TRUE' }), 0.520499877813047, 12);
  });

  it('uses Excel error codes for mismatched test arrays and invalid T.TEST parameters', () => {
    for (const name of ['CHISQ.TEST', 'CHITEST']) {
      expect(evaluate(`=${name}(1,{45,48;24,22})`)).toEqual({ kind: 'error', code: '#N/A' });
    }
    for (const name of ['T.TEST', 'TTEST']) {
      expect(evaluate(`=${name}(1,{1,2,4},2,1)`)).toEqual({ kind: 'error', code: '#N/A' });
      expect(evaluate(`=${name}({1,2,3},{1,2,4},-1,1)`)).toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluate(`=${name}({1,2,3},{1,2,4},2,4)`)).toEqual({ kind: 'error', code: '#NUM!' });
    }
    expect(evaluate('=T.TEST({1,2,3},{1,2,4},"1.5",1)'))
      .toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=TTEST({1,2,3},{1,2,4},"1.5",1)')).toBeCloseTo(0.21132486540518697, 12);
    for (const name of ['CHISQ.TEST', 'CHITEST']) {
      expect(evaluate(`=${name}(A1,{45,48;24,22})`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(IF(TRUE,A1,0),{45,48;24,22})`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(A1,{45,48;24,22})`, { '0,0': 0 })).toEqual({ kind: 'error', code: '#N/A' });
    }
    expect(evaluate('=T.TEST(A1,{1,2,4},2,1)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=T.TEST(IF(TRUE,A1,0),{1,2,4},2,1)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=T.TEST(A1,{1,2,4},2,1)', { '0,0': 0 })).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=TTEST(A1,{1,2,4},2,1)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TTEST(IF(TRUE,A1,0),{1,2,4},2,1)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TTEST(A1,{1,2,4},2,1)', { '0,0': 0 })).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('returns a division error when T.TEST samples have zero standard error', () => {
    for (const name of ['T.TEST', 'TTEST']) {
      for (const type of [1, 2, 3]) {
        expect(evaluate(`=${name}({1;1;1},{1;1;1},2,${type})`))
          .toEqual({ kind: 'error', code: '#DIV/0!' });
      }
      expect(evaluate(`=${name}({1;2;3},{1;2;3},2,1)`))
        .toEqual({ kind: 'error', code: '#DIV/0!' });
      expectClose(evaluate(`=${name}({1;2;3},{1;2;4},2,1)`), 0.42264973081037427, 12);
    }
  });

  it('returns five regression statistic rows when LINEST and LOGEST request details', () => {
    expect(evaluate('=ROWS(LINEST({1;2;3},{1;2;3},TRUE,FALSE))')).toBe(1);
    expect(evaluate('=ROWS(LINEST({1;2;3},{1;2;3},TRUE,TRUE))')).toBe(5);
    expect(evaluate('=ROWS(LOGEST({2;4;8},{1;2;3},TRUE,TRUE))')).toBe(5);
    expect(evaluate('=INDEX(LINEST({1;2;3;4},{1;2;3;4},TRUE,TRUE),4,2)')).toBe(2);
    expectClose(evaluate('=INDEX(LINEST({1;2;2;4},{1;2;3;4},TRUE,TRUE),3,1)'), 4.05 / 4.75, 12);
    expectClose(evaluate('=INDEX(LINEST({1;2;2;4},{1;2;3;4},TRUE,TRUE),3,2)'), Math.sqrt(0.35), 12);
    expect(evaluate('=ROWS(LINEST({1;3;4;6},{0,0;1,0;0,1;1,1},TRUE,TRUE))')).toBe(5);
    expect(evaluate('=COLUMNS(LINEST({1;3;4;6},{0,0;1,0;0,1;1,1},TRUE,TRUE))')).toBe(3);
  });

  it('computes confidence intervals for tiny positive significance levels', () => {
    expectClose(evaluate('=CONFIDENCE.NORM(1E-20,1,100)'), 0.933604484923, 10);
    expectClose(evaluate('=CONFIDENCE.T(1E-20,1,100)'), 1.1864555958627, 10);
    expectClose(evaluate('=CONFIDENCE.NORM(1E-12,1,100)'), 0.7130506848171325, 10);
  });

  it('checks test-array shape before filtering nonnumeric cells', () => {
    const data = { '0,0': false, '0,1': 2, '1,0': 1, '1,1': 3 };
    expect(evaluate('=CHITEST(A1:A2,{45,48;24,22})', data)).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=TTEST({1,2,3},A1:B2,2,1)', data)).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=CHITEST(A1,{45,48;24,22})', {
      '0,0': createFormulaError(FormulaErrorCode.Name),
    })).toEqual({ kind: 'error', code: '#NAME?' });
  });

  it('omits nonnumeric CHITEST pairs without losing a small upper-tail result', () => {
    const expectedWithLogical = { '0,0': false, '0,1': 2, '1,0': 1, '1,1': 3 };
    const actualWithText = { '0,0': '2024-02-29', '0,1': 2, '1,0': 1, '1,1': 3 };
    const first = evaluate('=CHITEST({58,35;11,25},A1:B2)', expectedWithLogical);
    const second = evaluate('=CHITEST(A1:B2,{45,48;24,22})', actualWithText);
    expect((first as number) / 2.909344640726335e-177).toBeCloseTo(1, 10);
    expect((second as number) / 1.0386323727364166e-19).toBeCloseTo(1, 10);
  });

  it('ignores nonnumeric ZTEST references and rejects a zero supplied standard deviation', () => {
    for (const value of [true, '0', '1.5', '001']) {
      expect(evaluate('=ZTEST(IF(TRUE,A1,0),4)', { '0,0': value }))
        .toEqual({ kind: 'error', code: '#N/A' });
    }
    expect(evaluate('=ZTEST({3,6,7,8},4,A1)', { '0,0': 0 }))
      .toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('rounds up fractional LARGE ranks and truncates SMALL ranks without replacing value errors', () => {
    for (const name of ['LARGE', 'SMALL']) {
      expect(evaluate(`=${name}({3,8,5},1.005)`)).toBe(name === 'LARGE' ? 5 : 3);
      expect(evaluate(`=${name}({3,8,5},"FALSE")`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}("abc",1)`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}("",1)`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}("2024-02-29",100)`)).toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluate(`=${name}("2",1)`)).toBe(2);
      expect(evaluate(`=${name}(TRUE,1)`)).toBe(1);
    }
    expect(evaluate('=LARGE({1,2,3},1.9)')).toBe(2);
    expect(evaluate('=SMALL({1,2,3},1.9)')).toBe(1);
    expect(evaluate('=LARGE({6,-6,1,8,-4,3,10,-2},1.005)')).toBe(8);
    expect(evaluate('=LARGE({6,-6,1,8,-4,3,10,-2},2.675)')).toBe(6);
  });

  it('uses numeric errors and direct scalar coercion for AVEDEV and DEVSQ', () => {
    for (const name of ['AVEDEV', 'DEVSQ']) {
      expect(evaluate(`=${name}(A1)`)).toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluate(`=${name}(IF(TRUE,A1,0))`)).toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluate(`=${name}("abc")`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}("1")`)).toBe(0);
      expect(evaluate(`=${name}("2024-02-29")`)).toBe(0);
      expect(evaluate(`=${name}(TRUE)`)).toBe(0);
    }
  });

  it('validates hypergeometric sample bounds and truncates discrete inputs', () => {
    expect(evaluate('=HYPGEOMDIST(-1,4,8,20)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=HYPGEOMDIST(1,4,1.5,20)')).toBeCloseTo(0.2, 12);
    expect(evaluate('=HYPGEOM.DIST(0,10,9,10,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=HYPGEOM.DIST(1,0,8,20,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=HYPGEOM.DIST(1,FALSE,8,20,FALSE)')).toBe(0);
    expect(evaluate('=HYPGEOM.DIST(1,FALSE,8,20,TRUE)')).toBe(1);
  });

  it('rejects referenced date text as the Poisson mean', () => {
    expect(evaluate('=POISSON.DIST(2,A1,TRUE)', { '0,0': '2024-02-29' }))
      .toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('requires three numeric observations for population skewness', () => {
    expect(evaluate('=SKEW.P(A1:A3)', { '0,0': '', '1,0': 1, '2,0': 2 }))
      .toEqual({ kind: 'error', code: '#DIV/0!' });
  });

  it('preserves exact integer percentile interpolation', () => {
    expect(evaluate('=PERCENTILE.INC({-59,1,2},0.3)')).toBe(-23);
  });

  it('keeps direct date text distinct for quartiles and percentiles', () => {
    expect(evaluate('=QUARTILE.INC("2024-02-29",1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=QUARTILE.EXC("2024-02-29",2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PERCENTILE.INC("2024-02-29",0.3)')).toBe(45351);
  });

  it('normalizes the F distribution density by the denominator degrees of freedom', () => {
    expect(evaluate('=F.DIST(15.2069,6,4,FALSE)')).toBeCloseTo(0.0012237917087831725, 12);
  });

  it('validates chi-square inverse degrees of freedom and endpoint probabilities', () => {
    expect(evaluate('=CHISQ.INV(0.93,FALSE)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=CHISQ.INV(0,1)')).toBe(0);
    expect(evaluate('=CHIINV(1,10)')).toBe(0);
    expectClose(evaluate('=CHISQ.INV(0.93,1.005)'), 3.28302028675954, 9);
  });

  it('validates confidence interval input domains before calculating a quantile', () => {
    for (const name of ['CONFIDENCE', 'CONFIDENCE.NORM', 'CONFIDENCE.T']) {
      expect(evaluate(`=${name}("",2.5,50)`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(1,2.5,50)`)).toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluate(`=${name}(0.05,0,50)`)).toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluate(`=${name}(0.05,-1,50)`)).toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluate(`=${name}(0.05,2.5,0)`)).toEqual({ kind: 'error', code: '#NUM!' });
    }
    expect(evaluate('=CONFIDENCE.T(0.05,2.5,1)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=CONFIDENCE(0.05,2.5,1.5)')).toBeCloseTo(4.89990996135013, 11);
  });

  it('keeps the inverse Fisher transform finite at large inputs', () => {
    expect(evaluate('=FISHERINV("2024-02-29")')).toBe(1);
    expect(evaluate('=FISHERINV(-1000)')).toBe(-1);
  });

  it('preserves tiny nonzero Fisher transform inputs', () => {
    for (const value of [1e-17, 1e-12, 0.5]) {
      expect(evaluate(`=FISHER(${value})`)).toBe(Math.atanh(value));
    }
    expect(evaluate('=FISHER(-1E-17)')).toBe(-1e-17);
  });

  it('keeps harmonic means finite for tiny positive samples', () => {
    expect(evaluate('=HARMEAN(1E-308,1E-308)')).toBe(1e-308);
    expect(evaluate('=HARMEAN(1E-308,1E308)')).toBe(2e-308);
    expect(evaluate('=HARMEAN(2,6)')).toBe(3);
  });

  it('interpolates large medians and percentiles without overflow', () => {
    expect(evaluate('=MEDIAN(1E308,1E308)')).toBe(1e308);
    expect(evaluate('=MEDIAN(-1E308,1E308)')).toBe(0);
    for (const formula of [
      '=PERCENTILE.INC({-1E308;1E308},0.5)',
      '=PERCENTILE.EXC({-1E308;1E308},0.5)',
      '=QUARTILE.INC({-1E308;1E308},2)',
    ]) expect(evaluate(formula)).toBe(0);
  });

  it('interpolates percentile ranks across a large zero crossing', () => {
    expect(evaluate('=PERCENTRANK.INC({-1E308;1E308},0)')).toBe(0.5);
    expect(evaluate('=PERCENTRANK.EXC({-1E308;1E308},0)')).toBe(0.5);
  });

  it('preserves small exponential and Weibull cumulative probabilities', () => {
    expect(evaluate('=EXPON.DIST(1E-20,1,TRUE)')).toBe(1e-20);
    expect(evaluate('=WEIBULL.DIST(1E-20,1,1,TRUE)')).toBe(1e-20);
  });

  it('preserves rare zero-event Poisson cumulative probabilities', () => {
    const cumulative = evaluate('=POISSON.DIST(0,100,TRUE)') as number;
    const point = evaluate('=POISSON.DIST(0,100,FALSE)') as number;
    expect(cumulative).toBeGreaterThan(0);
    expect(cumulative / point).toBeCloseTo(1, 10);
  });

  it('preserves rare single-point binomial range probabilities', () => {
    for (const successes of [99, 100]) {
      const range = evaluate(`=BINOM.DIST.RANGE(100,0.5,${successes},${successes})`) as number;
      const point = evaluate(`=BINOM.DIST(${successes},100,0.5,FALSE)`) as number;
      expect(range).toBeGreaterThan(0);
      expect(range / point).toBeCloseTo(1, 12);
    }
    expect(evaluate('=BINOM.DIST.RANGE(10,0.5,4,6)')).toBeCloseTo(0.65625, 12);
  });

  it('propagates distribution domain errors and truncates degrees of freedom', () => {
    expect(evaluate('=CHIDIST(-1,10)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FDIST(-1,6,4)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=TDIST(-1,60,2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FINV(0.01,FALSE,4)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FTEST(A1,{1,2,4})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=FTEST("0",{1,2,4})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=FTEST(TRUE,{1,2,4})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=FTEST({1,2,3},IF(TRUE,"abc",0))')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=FTEST(1,{1,2,4})')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=FTEST({-1,1,2},{1,2,4})')).toBe(1);
    expect(evaluate('=TINV(1,10)')).toBe(0);
    expectClose(evaluate('=CHIINV(0.05,1.005)'), 3.84145882069412, 9);
  });

  it('keeps right-tail F inverse precision for a small tail probability', () => {
    const result = evaluate('=FINV(0.01,6,1)');
    expect(typeof result).toBe('number');
    expect(Math.abs((result as number) - 5858.986106686196)).toBeLessThan(5e-9);
  });

  it('keeps representable chi-square right-tail probabilities', () => {
    for (const [x, expected] of [[50, 1.537459794428e-12], [100, 1.523970604832e-23]]) {
      const tail = evaluate(`=CHISQ.DIST.RT(${x},1)`) as number;
      expect(tail).toBeGreaterThan(0);
      expect(tail / expected).toBeCloseTo(1, 7);
    }
  });

  it('inverts tiny chi-square right-tail probabilities', () => {
    for (const probability of [1e-10, 1e-20]) {
      const quantile = evaluate(`=CHISQ.INV.RT(${probability},1)`) as number;
      expect(quantile).toBeGreaterThan(0);
      const tail = evaluate(`=CHISQ.DIST.RT(${quantile},1)`) as number;
      expect(tail / probability).toBeCloseTo(1, 7);
    }
  });

  it('keeps Student t right tails finite and consistent with the F distribution', () => {
    const fTail = evaluate('=F.DIST.RT(100,1,100)') as number;
    const oneTail = evaluate('=T.DIST.RT(10,100)') as number;
    const twoTail = evaluate('=T.DIST.2T(10,100)') as number;
    expect(oneTail).toBeGreaterThan(0);
    expect(twoTail / fTail).toBeCloseTo(1, 7);
    expect(oneTail * 2 / twoTail).toBeCloseTo(1, 12);
  });

  it('inverts tiny Student t two-tail probabilities', () => {
    const quantile = evaluate('=T.INV.2T(1E-20,100)') as number;
    const fQuantile = evaluate('=F.INV.RT(1E-20,1,100)') as number;
    expect(quantile / Math.sqrt(fQuantile)).toBeCloseTo(1, 7);
    expect((evaluate(`=T.DIST.2T(${quantile},100)`) as number) / 1e-20).toBeCloseTo(1, 7);
  });

  it('resolves representable tiny left-tail inverse distributions', () => {
    for (const [inverse, cumulative] of [
      ['=CHISQ.INV(1E-20,1)', '=CHISQ.DIST(A1,1,TRUE)'],
      ['=F.INV(1E-20,1,1)', '=F.DIST(A1,1,1,TRUE)'],
      ['=BETA.INV(1E-20,0.5,0.5)', '=BETA.DIST(A1,0.5,0.5,TRUE)'],
      ['=GAMMA.INV(1E-20,0.5,1)', '=GAMMA.DIST(A1,0.5,1,TRUE)'],
    ]) {
      const quantile = evaluate(inverse) as number;
      expect(quantile).toBeGreaterThan(0);
      const probability = evaluate(cumulative, { '0,0': quantile }) as number;
      expect(probability / 1e-20).toBeCloseTo(1, 7);
    }
  });

  it('keeps the F right tail finite for very large finite inputs', () => {
    expect(evaluate('=F.DIST(1E308,2,2,TRUE)')).toBe(1);
    expect((evaluate('=F.DIST.RT(1E308,2,2)') as number) / 1e-308).toBeCloseTo(1, 7);
    expect((evaluate('=F.DIST.RT(1E20,2,2)') as number) / 1e-20).toBeCloseTo(1, 7);
  });

  it('inverts very small F right-tail probabilities without cancellation', () => {
    for (const probability of [1e-20, 1e-300]) {
      const quantile = evaluate(`=F.INV.RT(${probability},2,2)`) as number;
      expect(Number.isFinite(quantile)).toBe(true);
      expect(quantile / (1 / probability)).toBeCloseTo(1, 7);
    }
  });

  it('standardizes large finite normal inputs before intermediate overflow', () => {
    const cumulative = evaluate('=NORM.DIST(1E308,-1E308,1E308,TRUE)');
    const reference = evaluate('=NORM.S.DIST(2,TRUE)');
    expect(cumulative).toBeCloseTo(reference as number, 12);
    expect(evaluate('=STANDARDIZE(1E308,-1E308,1E308)')).toBe(2);
    const density = evaluate('=NORM.DIST(1E308,-1E308,1E308,FALSE)') as number;
    const densityReference = evaluate('=NORM.S.DIST(2,FALSE)/1E308') as number;
    expect(density).toBeGreaterThan(0);
    expect(density / densityReference).toBeCloseTo(1, 12);
  });

  it('combines large normal quantiles without overflowing a cancelling product', () => {
    const actual = evaluate('=NORM.INV(NORM.S.DIST(2,TRUE),-1E308,1E308)') as number;
    const reference = evaluate('=1E308*(NORM.S.INV(NORM.S.DIST(2,TRUE))-1)') as number;
    expect(Number.isFinite(actual)).toBe(true);
    expect(actual / reference).toBeCloseTo(1, 12);
  });

  it('keeps symmetric beta distributions centered on very large finite intervals', () => {
    expect(evaluate('=BETA.DIST(0,1,1,TRUE,-1E308,1E308)')).toBe(0.5);
    expect(evaluate('=BETA.DIST(0.5,1,1,TRUE)')).toBeCloseTo(0.5, 12);
    expect(evaluate('=BETA.INV(0.5,1,1,-1E308,1E308)')).toBe(0);
    expect(evaluate('=BETA.INV(0.5,1,1,-1E100,1E100)')).toBe(0);
  });

  it('rejects excess percentile and quartile arguments', () => {
    expect(evaluate('=PERCENTILE.INC({1;2;3},0.5,99)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=QUARTILE.INC({1;2;3;4},1,99)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=PERCENTILE.INC({1;2;3},0.5)')).toBe(2);
    expect(evaluate('=QUARTILE.INC({1;2;3;4},1)')).toBe(1.75);
  });

  it('rejects excess binomial range and hypergeometric arguments', () => {
    expect(evaluate('=BINOM.DIST.RANGE(5,0.5,1,3,99)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=HYPGEOM.DIST(1,2,3,4,FALSE,99)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=BINOM.DIST.RANGE(5,0.5,1,3)')).toBe(0.78125);
    expect(evaluate('=HYPGEOM.DIST(1,2,3,4,FALSE)')).toBeCloseTo(0.5, 12);
  });

  it('keeps representable Z test right-tail probabilities', () => {
    for (const value of [8, 6]) {
      const actual = evaluate(`=Z.TEST({${value};${value}},0,1)`) as number;
      const reference = evaluate(`=NORM.S.DIST(-${value}*SQRT(2),TRUE)`) as number;
      expect(actual).toBeGreaterThan(0);
      expect(actual / reference).toBeCloseTo(1, 12);
    }
  });

  it('keeps finite covariance when the unscaled product sum overflows', () => {
    const large = evaluate('=COVARIANCE.P({-1E154;1E154},{-1E154;1E154})') as number;
    const small = evaluate('=COVARIANCE.P({-1E150;1E150},{-1E150;1E150})') as number;
    expect(Number.isFinite(large)).toBe(true);
    expect(large / 1e308).toBeCloseTo(1, 12);
    expect(small / 1e300).toBeCloseTo(1, 12);
  });

  it('returns zero deviation for identical large finite values', () => {
    expect(evaluate('=AVEDEV(1E308,1E308)')).toBe(0);
    expect(evaluate('=DEVSQ(1E308,1E308)')).toBe(0);
    expect(evaluate('=STDEV.S(1E308,1E308)')).toBe(0);
    expect(evaluate('=DEVSQ(1E100,1E100)')).toBe(0);
  });

  it('keeps large identical median and trimmed means finite', () => {
    expect(evaluate('=MEDIAN(1E308,1E308)')).toBe(1e308);
    expect(evaluate('=MEDIAN(1E308,-1E308)')).toBe(0);
    expect(evaluate('=AVEDEV({1E308;1E308})')).toBe(0);
    expect(evaluate('=DEVSQ({1E308;1E308})')).toBe(0);
    expect(evaluate('=TRIMMEAN({1E308;1E308},0)')).toBe(1e308);
  });

  it('reports insufficient residual degrees of freedom for STEYX', () => {
    expect(evaluate('=STEYX({3;5},{1;2})')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=STEYX({3;5;7},{1;2;3})')).toBe(0);
    expect(evaluate('=STEYX({1;2},{1;2})')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=STEYX({1;2;3},{1;2;3})')).toBe(0);
  });

  it('returns a formula error for skewness of constant samples', () => {
    expect(evaluate('=SKEW({1,1,1})')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=SKEW.P({1,1,1})')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=SKEW({1,2,3})')).toBe(0);
    expect(evaluate('=SKEW.P({1,2,3})')).toBe(0);
  });

  it('keeps kurtosis and skewness invariant under large positive scaling', () => {
    expect(evaluate('=KURT(1,2,3,4)')).toBeCloseTo(-1.2, 12);
    expect(evaluate('=KURT(1E80,2E80,3E80,4E80)')).toBeCloseTo(-1.2, 12);
    expect(evaluate('=SKEW(1,2,3)')).toBe(0);
    expect(evaluate('=SKEW(1E110,2E110,3E110)')).toBe(0);
    expect(evaluate('=SKEW.P({1E110;2E110;3E110})')).toBe(0);
  });

  it('keeps finite variance and standard deviation when intermediate squares overflow', () => {
    expect(evaluate('=VAR.P(-1E154,1E154)')).toBe(1e308);
    expect(evaluate('=STDEV.P(-1E154,1E154)')).toBe(1e154);
    expect((evaluate('=STDEV.S(-1E154,1E154)') as number) / (Math.SQRT2 * 1e154)).toBeCloseTo(1, 12);
    expect(evaluate('=VAR.P(1E308,1E308)')).toBe(0);
    expect(evaluate('=STDEV.P(1E308,1E308)')).toBe(0);
  });

  it('returns exact integer variance when all intermediate integer arithmetic is safe', () => {
    expect(evaluate('=VAR({-60;1;2})')).toBe(1261);
    expect(evaluate('=VAR.S({60,1,2})')).toBe(1141);
    expect(evaluate('=VAR.P({-1;0;1})')).toBeCloseTo(2 / 3, 12);
    expect(evaluate('=VAR.P(-1E154,1E154)')).toBe(1e308);
  });

  it('keeps large safe-integer sample deviations exact', () => {
    expect(evaluate('=STDEV(1,2,3,-1000000000000)')).toBe(500000000001);
    expect(evaluate('=STDEV(1,2,3,A1)', { '0,0': -1000000000000 })).toBe(500000000001);
    expect(evaluate('=STDEV(1,2,3,A1)', { '0,0': -10 })).toBeCloseTo(6.0553007081949835, 12);
  });

  it('retains GAUSS probabilities close to zero without cancellation', () => {
    for (const value of [1e-16, -1e-16, 1e-15, 1e-10]) {
      const actual = evaluate(`=GAUSS(${value})`) as number;
      expect(actual / (value / Math.sqrt(2 * Math.PI))).toBeCloseTo(1, 12);
    }
    expect(evaluate('=GAUSS(0)')).toBe(0);
  });

  it('fits LINEST, LOGEST, TREND, and GROWTH without a constant term when requested', () => {
    expect(evaluate('=INDEX(LINEST({3;5;7},{1;2;3},0),1,2)')).toBe(0);
    expect(evaluate('=INDEX(LOGEST({4;8;16},{1;2;3},0),1,2)')).toBe(1);
    expect(evaluate('=INDEX(TREND({3;5;7},{1;2;3},{4},0),1,1)')).toBeCloseTo(68 / 7, 12);
    expect(evaluate('=INDEX(GROWTH({4;8;16},{1;2;3},{4},0),1,1)')).toBeCloseTo(2 ** (40 / 7), 12);
    expect(evaluate('=INDEX(LINEST({3;5;7},{1;2;3}),1,2)')).toBe(1);
    expect(evaluate('=INDEX(LOGEST({4;8;16},{1;2;3}),1,2)')).toBe(2);
    expect(evaluate('=INDEX(LINEST({3;5;7},{1;2;3},FALSE),1,2)')).toBe(0);
    expect(evaluate('=INDEX(TREND({3;5;7},{1;2;3},{1},FALSE),1,1)')).toBeCloseTo(17 / 7, 12);
  });

  it('preserves the shape of explicit horizontal regression predictions', () => {
    expect(evaluate('=COLUMNS(TREND({1;2;3},{1;2;3},{4,5}))')).toBe(2);
    expect(evaluate('=ROWS(TREND({1;2;3},{1;2;3},{4,5}))')).toBe(1);
    expect(evaluate('=TREND({1;2;3},{1;2;3},{4,5})')).toEqual([[4, 5]]);
    expect(evaluate('=COLUMNS(GROWTH({2;4;8},{1;2;3},{4,5}))')).toBe(2);
    expect(evaluate('=ROWS(GROWTH({2;4;8},{1;2;3},{4,5}))')).toBe(1);
    expect(evaluate('=TREND({1;2;3},{1;2;3},{4;5})')).toEqual([[4], [5]]);
  });

  it('fits multiple predictors by observation instead of requiring identical array shapes', () => {
    const coefficients = evaluate('=LINEST({2;3;5},{1,0;0,1;1,1})') as number[][];
    expect(coefficients[0]?.[0]).toBeCloseTo(3, 12);
    expect(coefficients[0]?.[1]).toBeCloseTo(2, 12);
    expect(coefficients[0]?.[2]).toBeCloseTo(0, 12);
    expect(evaluate('=INDEX(LINEST({2;3;5},{1,0;0,1;1,1}),1,1)')).toBeCloseTo(3, 12);
    expect(evaluate('=INDEX(TREND({2;3;5},{1,0;0,1;1,1},{2,1}),1,1)')).toBeCloseTo(7, 12);
    expect(evaluate('=INDEX(TREND({2;3;5},{1,0;0,1;1,1},{2,1;1,2}),2,1)')).toBeCloseTo(8, 12);
    expect(evaluate('=INDEX(LINEST({2;3;5},{1,0;0,1;1,1},0),1,3)')).toBe(0);
    expect(evaluate('=INDEX(LOGEST({2;3;6},{1,0;0,1;1,1}),1,1)')).toBeCloseTo(3, 12);
    expect(evaluate('=INDEX(GROWTH({2;3;6},{1,0;0,1;1,1},{2,1}),1,1)')).toBeCloseTo(12, 12);
    expect(evaluate('=TREND({2;3;5},{1,0;0,1;1,1},{2})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=COLUMNS(LINEST({1;3;4;6},{0,0;1,0;0,1;1,1}))')).toBe(3);
    expect(evaluate('=ROWS(TREND({1;3;4;6},{0,0;1,0;0,1;1,1},{1,1}))')).toBe(1);
    expect(evaluate('=INDEX(TREND({1;3;4;6},{0,0;1,0;0,1;1,1},{1,1}),1,1)')).toBeCloseTo(6, 12);
  });

  it('returns the exact midpoint of a symmetric t distribution', () => {
    expect(evaluate('=T.INV(0.5,5)')).toBe(0);
    expect(evaluate('=T.DIST(0,5,TRUE)')).toBe(0.5);
    expect(evaluate('=NORM.S.INV(0.5)')).toBe(0);
  });

  it('retains inverse distribution precision for large date-serial shape inputs', () => {
    const fInverse = evaluate('=FINV(0.01,"2024-02-29",4)');
    const gammaInverse = evaluate('=GAMMAINV(0.068094,"2024-02-29",2)');
    expect(typeof fInverse).toBe('number');
    expect(typeof gammaInverse).toBe('number');
    expect(Math.abs((fInverse as number) - 13.463303461171432)).toBeLessThan(1e-11);
    expect(Math.abs((gammaInverse as number) - 90068.1427565946)).toBeLessThan(1e-8);
  });

  it('bounds inverse binomial work and matches Excel numeric limits', () => {
    expect(evaluate('=BINOM.INV(6,0.5,0.75)')).toBe(4);
    expect(evaluate('=CRITBINOM(1000000000000,0.5,0.75)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=CRITBINOM(2147483647,0.5,0.75)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=CRITBINOM(1000000,0.5,0.75)')).toBe(500337);
    expect(evaluate('=CRITBINOM(1000000000,0.5,0.75)')).toBe(500010665);
    expect(evaluate('=CRITBINOM(2147483646,0.5,0.75)')).toBe(1073757451);
  });

  it('rejects inputs outside the FISHER domain', () => {
    expect(evaluate('=FISHER(-1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FISHER(1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FISHER(-1000000000000000)')).toEqual({ kind: 'error', code: '#NUM!' });
    expectClose(evaluate('=FISHER(0.75)'), 0.972955, 5);
  });

  it('uses Excel error codes for unequal covariance arrays', () => {
    expect(evaluate('=COVAR({1},{5,11,12})')).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('rejects unequal criteria range lengths in multi-criteria functions', () => {
    for (const formula of [
      '=COUNTIFS({1},">0",{1;2},"<3")',
      '=AVERAGEIFS({1;2},{1},">0")',
      '=MAXIFS({1;2},{1},">0")',
      '=MINIFS({1;2},{1},">0")',
    ]) {
      expect(evaluate(formula)).toEqual({ kind: 'error', code: '#VALUE!' });
    }
    expect(evaluate('=COUNTIFS({1;2},">0",{1;2},"<3")')).toBe(2);
  });

  it('handles direct arrays, text criteria, duplicate ranks, and legacy aliases', () => {
    expect(evaluate('=MEDIAN({1,2,3,4})')).toBe(2.5);
    expect(
      evaluate(
        '=COUNTBLANK(A1:A3)',
        {
          '0,0': 0,
          '1,0': { kind: 'text', value: '', numericCoercion: 'allow' },
        },
        [3, 1],
      ),
    ).toBe(2);
    expect(evaluate('=COUNTIF({"A","B","A"},"A")')).toBe(2);
    expect(evaluate('=COUNTIFS({"A";"A";"B"},"A",{1;2;3},">1")')).toBe(1);
    expect(evaluate('=RANK.AVG(3,{1,2,3,3,4},1)')).toBe(3.5);
    expectClose(evaluate('=协方差。S({2,4,8},{5,11,12})'), 9.666666667);
    expect(evaluate('=VAR({1,2,3})')).toBe(1);
  });

  it('returns not available for values absent from the source array in both orders', () => {
    expect(evaluate('=RANK.EQ(4,{1;3;5},0)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=RANK.AVG(4,{1;3;5},0)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=RANK.EQ(4,{1;3;5},1)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=RANK.AVG(4,{1;3;5},1)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=RANK.EQ(5,{1;3;5},0)')).toBe(1);
    expect(evaluate('=RANK.AVG(3,{1;3;3;5},0)')).toBe(2.5);
    expect(evaluate('=RANK.EQ(6,{1;3;5},0)')).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('keeps dynamic array result shapes stable', () => {
    expect(evaluate('=FREQUENCY({1,2,3,4},{2,3})')).toEqual([[2], [1], [1]]);
    expect(evaluate('=MODE.MULT({1,1,2,2,3})')).toEqual([[1], [2]]);
    expect(evaluate('=ROWS(MODE.MULT({1,1,2,2,3}))')).toBe(2);
    expect(evaluate('=COLUMNS(MODE.MULT({1,1,2,2,3}))')).toBe(1);
    expect(evaluate('=LINEST({2,4,6},{1,2,3})')).toEqual([[2, 0]]);
    expect(evaluate('=TREND({2,4,6},{1,2,3},{4,5})')).toEqual([[8, 10]]);
  });

  it('uses the known X values and validates regression input shape', () => {
    expect(evaluate('=TREND({2,4,6},{1,2,3})')).toEqual([[2], [4], [6]]);
    const growth = evaluate('=GROWTH({2,4,8},{1,2,3})') as number[][];
    expect(growth).toHaveLength(3);
    growth.forEach(([value], index) => expect(value).toBeCloseTo([2, 4, 8][index]!, 12));
    expect(evaluate('=LINEST(10,{1,2,3})')).toEqual([[0, 10]]);
    const logest = evaluate('=LOGEST(10,{1,2,3})') as number[][];
    expect(logest[0]?.[0]).toBeCloseTo(1, 12);
    expect(logest[0]?.[1]).toBeCloseTo(10, 12);
    expect(evaluate('=TREND(10,{1,2,3},{4,5})')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=GROWTH(10,{1,2,3},{4,5})')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=GROWTH(-10,{1,2,3},{4,5})')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=GROWTH({-1,2,3},{1,2},{4})')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=TREND({2,4,6},{1,2},{4,5})')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=GROWTH({2,4,8},{1,2},{4,5})')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=TREND({2,4,6},"1",{4,5})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=GROWTH({2,4,8},FALSE,{4})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TREND({2,4,6},A1,{4,5})', { '0,0': '1' })).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=GROWTH({2,4,8},A1,{4})', { '0,0': false })).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=GROWTH({2,4,8},{1,2,3},"1.5")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TREND({2,4,6},{1,2,3},"1.5")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=TREND({2,4,6},{1,2,3},A1)', { '0,0': createFormulaError(FormulaErrorCode.Reference) })).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=GROWTH(IF(TRUE,A1,0),{1,2,3},{4})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=GROWTH({2,4,8},{1,2,3},{4},A1)', { '0,0': createFormulaError(FormulaErrorCode.Value) })).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=LINEST({2,4,6},1)')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=LOGEST({2,4,8},1)')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=LINEST({2,4,6},{1;2;3})')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=LOGEST({2,4,8},{1;2;3})')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=TREND({2,4,6},{1,2;3,4},{5})')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=GROWTH({2,4,8},{1,2;3,4},{5})')).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=LINEST(1/0,{1,2,3})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=LINEST({2,4,6},1/0)')).toEqual({ kind: 'error', code: '#REF!' });
  });

  it('excludes unoccupied cells from numeric statistical ranges', () => {
    const data = { '0,0': 1, '1,0': 2, '2,0': 3, '0,1': 2, '1,1': 4, '2,1': 6 };
    expect(evaluate('=PERCENTRANK.INC(A1:A100,2)', data, [100, 2])).toBe(0.5);
    expect(evaluate('=PERCENTRANK.EXC(A1:A100,2)', data, [100, 2])).toBe(0.5);
    expect(evaluate('=PERCENTRANK.INC({5},5)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PERCENTRANK.INC(A1,5)', { '0,0': 5 })).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PERCENTRANK.EXC({5},5)')).toBe(0.5);
    expect(evaluate('=AVERAGE(1E308,1E308)')).toBe(1e308);
    expect(evaluate('=AVERAGE({1E308;1E308})')).toBe(1e308);
    expect(evaluate('=AVERAGE(1E308,-1E308)')).toBe(0);
    expect(evaluate('=CORREL({1E200;2E200},{1E200;2E200})')).toBe(1);
    expect(evaluate('=PEARSON({1E200;2E200},{1E200;2E200})')).toBe(1);
    expect(evaluate('=RSQ({1E200;2E200},{1E200;2E200})')).toBe(1);
    expect(evaluate('=CORREL({1E150;2E150},{1E150;2E150})')).toBe(1);
    expect(evaluate('=CORREL({1E200;2E200},{2E200;1E200})')).toBe(-1);
    expect(evaluate('=CORREL({1E200;2E200;3E200},{1E200;2E200;3E200})')).toBe(1);
    expect(evaluate('=PEARSON({1E200;2E200;3E200},{1E200;2E200;3E200})')).toBe(1);
    expect(evaluate('=RSQ({1E200;2E200;3E200},{1E200;2E200;3E200})')).toBe(1);
    expect(evaluate('=SLOPE({1E200;2E200},{1E200;2E200})')).toBe(1);
    expect(evaluate('=INTERCEPT({1E200;2E200},{1E200;2E200})')).toBe(0);
    expect(evaluate('=FORECAST.LINEAR(3E200,{1E200;2E200},{1E200;2E200})')).toBe(3e200);
    expect(evaluate('=STEYX({1E200;2E200;3E200},{1E200;2E200;3E200})')).toBe(0);
    expect(evaluate('=SLOPE({1E200;2E200;3E200},{1E200;2E200;3E200})')).toBe(1);
    expect(evaluate('=FORECAST.LINEAR(4E200,{1E200;2E200;3E200},{1E200;2E200;3E200})')).toBe(4e200);
    expect(evaluate('=INDEX(LINEST({1E200;2E200;3E200},{1E200;2E200;3E200}),1,1)')).toBe(1);
    expect(evaluate('=INDEX(LINEST(A1:C1,{1,2,3}),1,1)', {
      '0,0': -1000000000000, '0,1': 1, '0,2': 2,
    })).toBe(500000000001);
    expect(evaluate('=NORM.S.INV(0.5,7)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=NORM.INV(0.5,10,2,999)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=LOGNORM.INV(0.5,0,1,999)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=NORM.INV(0.5,10,2)')).toBe(10);
    expect(evaluate('=PERCENTRANK.INC({1,2,3},1.5,0.5)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PERCENTRANK.INC({1,2,3},1.5,16)')).toBe(0.25);
    expect(evaluate('=PERCENTRANK.EXC({1,2,3},1.5,16)')).toBe(0.375);
    expect(evaluate('=PERCENTRANK.INC({1,2,3},1.5,1000)')).toBe(0.25);
    for (const name of ['PERCENTRANK.INC', 'PERCENTRANK.EXC']) {
      expect(evaluate(`=${name}({1,2,3,4},3,45000)`)).toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluate(`=${name}({1,2,3,4},3,1000)`)).toEqual(
        name.endsWith('.INC') ? 2 / 3 : 0.6,
      );
    }
    expect(evaluate('=PERCENTRANK.INC({1,2,3,4,5,6,7},3.5)')).toBe(0.416);
    expect(evaluate('=PERCENTRANK.EXC({1,2,3,4,5,6,7},3.5)')).toBe(0.437);
    expect(evaluate('=PERMUT(4,3)')).toBe(24);
    expect(evaluate('=PERMUT(0,0)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PERMUT(3,-0.5)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PERMUT(3,-1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PERMUT(4,1.9)')).toBe(4);
    expect(evaluate('=F.INV(0.5,2.8752,2)')).toBe(1);
    expect(evaluate('=F.INV(0.5,"2024-02-29",2)')).toBeCloseTo(1.4426729907698763, 12);
    expect(evaluate('=GAMMA(-6.0006)')).toBeCloseTo(-2.3122164916317867, 12);
    expect(evaluate('=GAMMA(-3.0003)')).toBeCloseTo(555.3463171743253, 9);
    expect((evaluate('=PERMUT(1000000000000,3)') as number) / 9.90352028661293e27).toBeCloseTo(1, 12);
    expect(evaluate('=PERMUTATIONA(4.9,1.9)')).toBe(4);
    expect(evaluate('=PERMUT(4,1/0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    const errorData = { '0,0': { kind: 'error' as const, code: FormulaErrorCode.NotAvailable },
      '0,2': 1, '1,2': 2, '2,2': 3 };
    expect(evaluate('=RSQ(IF(TRUE,A1,0),C1:C3)', errorData, [3, 3])).toEqual(errorData['0,0']);
    expect(evaluate('=STEYX(IF(TRUE,A1,0),C1:C3)', errorData, [3, 3])).toEqual(errorData['0,0']);
    const numberData = { '0,0': 2, '0,2': 1, '1,2': 2, '2,2': 3 };
    expect(evaluate('=RSQ(IF(TRUE,A1,0),C1:C3)', numberData, [3, 3]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=STEYX(IF(TRUE,A1,0),C1:C3)', numberData, [3, 3]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=RSQ(IF(TRUE,A1,0),C1:C3)', { ...numberData, '0,0': '2' }, [3, 3]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=COVARIANCE.P(IF(TRUE,A1,0),C1:C3)', { ...numberData, '0,0': '2' }, [3, 3]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=COVARIANCE.S(IF(TRUE,A1,0),C1:C3)', { ...numberData, '0,0': '2' }, [3, 3]))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PROB({1,2,3},{0.2,0.3,0.5},2,3)')).toBe(0.8);
    expect(evaluate('=PROB({1,2},{0,1},2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PROB({1,2},{0.25,0.75},2)')).toBe(0.75);
    expect(evaluate('=PROB({1,2},{0.2,0.3,0.5},2,3)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=PROB({"x",2,3},{0.2,0.3,0.5},2,3)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PROB({1,2,3},{0.2,0.3,0.6},2,3)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=PROB(1/0,{0.2,0.3,0.5},2,3)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=COUNT(A1:A100)', data, [100, 2])).toBe(3);
    expect(evaluate('=SLOPE(B1:B100,A1:A100)', data, [100, 2])).toBe(2);
    expect(evaluate('=PERCENTRANK.INC(C1,49.5)', data, [100, 3])).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=PERCENTRANK.EXC("",49.5)')).toEqual({ kind: 'error', code: '#VALUE!' });
    for (const name of ['PERCENTRANK.INC', 'PERCENTRANK.EXC']) {
      expect(evaluate(`=${name}("TRUE",49.5)`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(IF(TRUE,A1,0),49.5)`, { '0,0': '' })).toEqual({ kind: 'error', code: '#N/A' });
      expect(evaluate(`=${name}({1,2,3,4},3,"a,b")`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}({1,2,3,4},3,0)`)).toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluate(`=${name}({1,2,3,4},3,A1)`, { '0,0': createFormulaError(FormulaErrorCode.Name) })).toEqual({
        kind: 'error',
        code: '#NAME?',
      });
    }
  });

  it('BUG-1010 rejects a negative fractional PERMUT selection before truncation', () => {
    const invalid = { kind: 'error', code: FormulaErrorCode.Number };
    for (const value of ['-0.2502', '-0.5004', '-0.7506']) {
      expect(evaluate(`=PERMUT(4,${value})`)).toEqual(invalid);
    }
    expect(evaluate('=PERMUT(4,A1)', { '0,0': -0.5 })).toEqual(invalid);
    expect(evaluate('=PERMUT(4,IF(TRUE,A1,0))', { '0,0': -0.5 })).toEqual(invalid);
    expect(evaluate('=PERMUT(4,A1)', { '0,0': 1.9 })).toBe(4);
    expect(evaluate('=PERMUT(4,0)')).toBe(1);
  });

  it('matches product arity errors and inverse distribution boundaries', () => {
    for (const formula of [
      '=PHI()', '=PHI(1,2)', '=GAUSS()', '=GAUSS(2,3)',
      '=PERMUTATIONA(3)', '=PERMUTATIONA(4,3,2)',
    ]) {
      expect(evaluate(formula)).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    }
    expect(evaluate('=BINOM.INV(2.1253,0.5,0.75)')).toBe(1);
    expect(evaluate('=BINOM.INV(2,0.5,0.750000000001)')).toBe(2);
    expect(evaluate('=GAMMA.INV(0,9,2)')).toBe(0);
    expect(evaluate('=GAMMAINV("0",9,2)')).toBe(0);
    for (const name of ['RANK.EQ', 'RANK.AVG']) {
      expect(evaluate(`=${name}(2,{1,2,3},"1.5")`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
      expect(evaluate(`=${name}(2,{1,2,3},"TRUE")`)).toBe(2);
    }
  });

  it('applies the distinct empty-input rules and direct scalar coercion for means', () => {
    expect(evaluate('=HARMEAN(A1)')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=HARMEAN(IF(TRUE,A1,0))')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=HARMEAN(A1)', { '0,0': 'text' })).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=HARMEAN(A1:A2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=HARMEAN(A1)', { '0,0': 2 })).toBe(2);
    expect(evaluate('=GEOMEAN(A1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=HARMEAN("")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=GEOMEAN("")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=HARMEAN(TRUE)')).toBe(1);
    expect(evaluate('=GEOMEAN("1.5")')).toBe(1.5);
    expect(evaluate('=HARMEAN(1000000000000000)')).toBe(1000000000000000);
  });

  it('evaluates large ranges without allocating eager argument arrays', () => {
    const rowCount = 20_000;
    const data: Record<string, FormulaValue> = {};
    for (let row = 0; row < rowCount; row++) data[`${row},0`] = (row % 100) + 1;
    const start = performance.now();
    expect(evaluate('=AVERAGE(A1:A20000)', data, [rowCount, 1])).toBe(50.5);
    expect(evaluate('=PERCENTILE.INC(A1:A20000,0.5)', data, [rowCount, 1])).toBe(50.5);
    expect(performance.now() - start).toBeLessThan(1_500);
  });
});
