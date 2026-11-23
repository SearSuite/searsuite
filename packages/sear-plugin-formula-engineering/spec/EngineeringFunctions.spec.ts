import type { EvalContext, FormulaValue } from '@searsuite/sear-domain-formula-engine';
import {
  AggregationCache,
  FormulaEvaluator,
  FormulaParser,
  FunctionRegistry,
} from '@searsuite/sear-domain-formula-engine-ts';
import { engineeringFunctions, registerEngineeringFunctions } from '../src';
import { expToSpreadsheetPrecision } from '../src/complex/expToSpreadsheetPrecision';
import { convertUnit } from '../src/shared/unitConversion';

const cells: Record<string, FormulaValue> = { '0,0': '3+4i', '1,0': '5-3i', '0,1': 13, '1,1': 25 };
const workbookCells: Record<string, FormulaValue> = { 'Inputs:0,0': '3+4i', 'Inputs:1,0': '5-3i' };
const context: EvalContext = {
  isCellInBounds: (row, col) => row >= 0 && row < 100 && col >= 0 && col < 100,
  getCellValue: (row, col) => cells[`${row},${col}`] ?? 0,
  getWorkbookCellValue: (sheet, row, col) => workbookCells[`${sheet}:${row},${col}`] ?? 0,
  *iterateRange(startRow, startCol, endRow, endCol) {
    for (let row = startRow; row <= endRow; row++)
      for (let col = startCol; col <= endCol; col++) yield cells[`${row},${col}`] ?? 0;
  },
  *iterateWorkbookRange(sheet, startRow, startCol, endRow, endCol) {
    for (let row = startRow; row <= endRow; row++)
      for (let col = startCol; col <= endCol; col++) yield workbookCells[`${sheet}:${row},${col}`] ?? 0;
  },
};

const registry = new FunctionRegistry();
registerEngineeringFunctions(registry);
const evaluator = new FormulaEvaluator(registry, new AggregationCache());
const parser = new FormulaParser();
const evaluate = (formula: string): FormulaValue => evaluator.evaluate(parser.parse(formula), context);

describe('engineering function registration and metadata', () => {
  it('registers all 57 documented functions exactly once', () => {
    expect(engineeringFunctions).toHaveLength(57);
    expect(new Set(engineeringFunctions.map((formula) => formula.name)).size).toBe(57);
    for (const formula of engineeringFunctions) {
      expect(registry.has(formula.name)).toBe(true);
      expect(formula.descriptor?.category).toBe('Engineering');
      expect(formula.descriptor?.example.startsWith('=')).toBe(true);
    }
  });

  it('publishes one combined notification for registration and disposal', () => {
    const isolatedRegistry = new FunctionRegistry();
    const changes: string[][] = [];
    isolatedRegistry.subscribe((names) => changes.push([...names]));

    const dispose = registerEngineeringFunctions(isolatedRegistry);
    dispose();

    const engineeringNames = engineeringFunctions.map((formula) => formula.name.toUpperCase());
    expect(changes).toEqual([engineeringNames, engineeringNames]);
  });

  it('lets a host omit functions outside its formula dialect', () => {
    const hostRegistry = new FunctionRegistry();
    const dispose = registerEngineeringFunctions(hostRegistry, {
      excludedNames: ['IMCOTH', 'IMLOG', 'IMTANH'],
    });
    expect(hostRegistry.has('IMCOTH')).toBe(false);
    expect(hostRegistry.has('IMLOG')).toBe(false);
    expect(hostRegistry.has('IMTANH')).toBe(false);
    expect(hostRegistry.has('IMSUM')).toBe(true);
    dispose();
    expect(hostRegistry.has('IMSUM')).toBe(false);
  });
});

describe('Bessel and error functions', () => {
  it('BUG-735 reports Bessel overflow while retaining finite boundary values', () => {
    expect(evaluate('=BESSELK(1E-160,2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=BESSELY(1E-160,2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=BESSELK(1E-308,1)')).toBe(1e308);
  });

  it('coerces date text only in numeric engineering arguments', () => {
    expect(evaluate('=BITAND("2024-02-29",25)')).toBe(1);
    expect(evaluate('=DEC2HEX("2024-02-29")')).toBe('B127');
    expect(evaluate('=COMPLEX("2024-02-29",4)')).toBe('45351+4i');
    expect(evaluate('=ERF("2024-02-29")')).toBe(1);
    expect(evaluate('=DELTA("2024-02-29",5)')).toBe(0);
  });

  it.each([
    ['=ERF(0.745)', 0.7079289200957377],
    ['=ERF(1)', 0.8427007929497148],
    ['=ERFC(1)', 0.15729920705028513],
    ['=ERF.PRECISE(1)', 0.8427007929497148],
    ['=ERFC.PRECISE(1)', 0.15729920705028513],
  ])('%s follows the high-precision reference', (formula, expected) => {
    expect(evaluate(formula)).toBeCloseTo(expected, 12);
  });

  it.each([
    ['=BESSELI(1.5,1)', 0.9816664286],
    ['=BESSELJ(1.9,2)', 0.329925829],
    ['=BESSELK(1.5,1)', 0.2773878036322587],
    ['=BESSELY(2.5,1)', 0.145918138],
    ['=ERF(1)', 0.84270079],
    ['=ERF(0,1)', 0.84270079],
    ['=ERFC(1)', 0.15729921],
    ['=ERF.PRECISE(1)', 0.84270079],
    ['=ERFC.PRECISE(1)', 0.15729921],
  ])('%s returns a numerically accurate result', (formula, expected) => {
    expect(evaluate(formula)).toBeCloseTo(expected, 6);
  });

  it.each([
    ['=BESSELK(1.5,0)', 0.213805569323654],
    ['=BESSELK(1.5,1)', 0.2773878036322587],
    ['=BESSELK(1.5,2)', 0.5836559741666656],
    ['=BESSELK(10,1)', 0.000018648773946849075],
    ['=BESSELK(59,1)', 3.908379503869471e-27],
  ])('%s follows Excel-compatible Bessel K results', (formula, expected) => {
    expect(evaluate(formula)).toBeCloseTo(expected, 12);
  });

  it.each(['=BESSELJ(1,-1)', '=BESSELK(0,1)', '=BESSELY(-1,1)'])('%s validates its domain', (formula) => {
    expect(evaluate(formula)).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('keeps small Bessel J arguments stable', () => {
    expect(evaluate('=BESSELJ(-1e-12,2)')).toBeCloseTo(1.25e-25, 30);
  });

  it('BUG-324 returns the exact zero-order Bessel J endpoint', () => {
    expect(evaluate('=BESSELJ(0,0)')).toBe(1);
    expect(evaluate('=BESSELJ(0,0)-1')).toBe(0);
    expect(evaluate('=BESSELI(0,0)')).toBe(1);
  });

  it.each([
    ['=BESSELJ(1.9,2)', 0.3299258286697852],
    ['=BESSELJ(-1,2)', 0.11490348499246938],
    ['=BESSELJ(1.5,3)', 0.06096395114888496],
    ['=BESSELJ(2,4)', 0.0339957198075715],
  ])('%s matches Excel backward recurrence', (formula, expected) => {
    expect(evaluate(formula)).toBeCloseTo(expected, 12);
  });

  it.each([
    ['=BESSELI(0.5,2)', 0.031906148375295325],
    ['=BESSELI(1.5,2)', 0.33783462087443816],
    ['=BESSELI(3,2)', 2.245212431347151],
  ])('%s matches Excel modified Bessel recurrence', (formula, expected) => {
    expect(evaluate(formula)).toBeCloseTo(expected, 12);
  });

  it('BESSELI reports overflow as a numeric error', () => {
    expect(evaluate('=BESSELI(-1000000000000,1)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it.each([
    ['=BESSELI(1.5,0)', 1.64672320214768],
    ['=BESSELI(1.5,1)', 0.981666428475166],
    ['=BESSELI(-1,1)', -0.565159097581943],
    ['=BESSELI(-60,1)', -5.84475417600045e24],
  ])('%s follows the product Bessel I approximation', (formula, expected) => {
    expect(evaluate(formula)).toBeCloseTo(expected, 12);
  });
});

describe('complex date text coercion', () => {
  it('coerces date text in direct, reference, and computed complex arguments', () => {
    const dateContext = { ...context, getCellValue: () => '2024-02-29' };
    const run = (formula: string) => evaluator.evaluate(parser.parse(formula), dateContext);
    expect(run('=IMABS("2024-02-29")')).toBe(45351);
    expect(run('=IMABS(A1)')).toBe(45351);
    expect(run('=IMABS(IF(TRUE,A1,0))')).toBe(45351);
    expect(run('=IMSUM(IF(TRUE,A1,0),"5-2i")')).toBe('45356-2i');
    expect(run('=IMAGINARY(IF(TRUE,A1,0))')).toBe(0);
    expect(run('=IMREAL(IF(TRUE,A1,0))')).toBe(45351);
  });
});

describe('radix and 48-bit operations', () => {
  it.each([
    ['=BIN2DEC(1100100)', 100],
    ['=BIN2DEC(1111111111)', -1],
    ['=BIN2DEC("")', 0],
    ['=BIN2HEX(11111011)', 'FB'],
    ['=BIN2OCT(1001)', '11'],
    ['=DEC2BIN(9,6)', '001001'],
    ['=DEC2HEX(100)', '64'],
    ['=DEC2OCT(58)', '72'],
    ['=DEC2BIN(-2.675)', '1111111110'],
    ['=DEC2HEX(2.675)', '2'],
    ['=DEC2OCT(0.5)', '0'],
    ['=HEX2BIN("F",8)', '00001111'],
    ['=HEX2BIN("")', '0'],
    ['=HEX2DEC("A5")', 165],
    ['=HEX2DEC("")', 0],
    ['=HEX2OCT("F")', '17'],
    ['=OCT2BIN(3)', '11'],
    ['=OCT2DEC(54)', 44],
    ['=OCT2DEC("")', 0],
    ['=OCT2HEX(100)', '40'],
    ['=BITAND(13,25)', 9],
    ['=BITOR(23,10)', 31],
    ['=BITXOR(5,3)', 6],
    ['=BITLSHIFT(4,2)', 16],
    ['=BITRSHIFT(16,2)', 4],
    ['=BITLSHIFT(8,-2)', 2],
    ['=BITAND(281474976710655,1)', 1],
  ])('%s follows Excel conversion semantics', (formula, expected) => expect(evaluate(formula)).toEqual(expected));

  it.each(['=BIN2DEC(1201)', '=DEC2BIN(512)', '=DEC2HEX(64,1)', '=BITAND(-1,2)', '=BITLSHIFT(1,54)', '=HEX2DEC(" A ")', '=HEX2BIN(" A ")', '=HEX2OCT(" A ")'])(
    '%s rejects invalid bounds',
    (formula) => {
      expect(evaluate(formula)).toEqual({ kind: 'error', code: '#NUM!' });
    },
  );
});

describe('complex functions', () => {
  it('preserves full precision for extended complex functions and their reciprocal boundaries', () => {
    expect(evaluate('=IMSINH("1+i")')).toBe('0.6349639147847361+1.2984575814159773i');
    expect(evaluate('=IMCOSH("1+i")')).toBe('0.8337300251311491+0.9888977057628651i');
    expect(evaluate('=IMCSC(0)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=IMCSC(-1.75)')).toBe('-1.01627467666275');
    expect(evaluate('=IMCSCH(0)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=IMCSCH(5.8755)')).toBe('0.00561482454983772');
    expect(evaluate('=IMCSCH(-1.0001)')).toBe('-0.850806410101344');
    expect(evaluate('=IMCSCH(45000)')).toBe('0');
    expect(evaluate('=IMSECH(-1000000000000000)')).toBe('0');
    expect(evaluate('=IMCOT(1)')).toBe('0.6420926159343308');
    expect(evaluate('=IMCOT(-10)')).toBe('-1.54235104535692');
    expect(evaluate('=IMCOT(-1000000000000)')).toBe('1.294823607823323');
    expect(evaluate('=IMTAN(1)')).toBe('1.557407724654902');
    expect(evaluate('=IMTAN(-60)')).toBe('-0.3200403893795629');
    expect(evaluate('=IMCOT(1e-12)')).toBe('1000000000000');
    expect(evaluate('=IMTAN(-45000)')).toBe('0.17492203811137166');
  });

  it.each(['IMCOSH', 'IMCOT', 'IMCSC', 'IMCSCH', 'IMSECH', 'IMSINH', 'IMTAN'])(
    '%s reports the product error for invalid argument counts',
    (name) => {
      expect(evaluate(`=${name}()`)).toEqual({ kind: 'error', code: '#NAME?' });
      expect(evaluate(`=${name}("1+i",2)`)).toEqual({ kind: 'error', code: '#NAME?' });
    },
  );

  it.each([
    ['=COMPLEX(3,4)', '3+4i'],
    ['=COMPLEX(0,1,"j")', 'j'],
    ['=IMABS("5+12i")', 13],
    ['=IMAGINARY("3+4i")', 4],
    ['=IMARGUMENT("3+4i")', 0.9272952180016122],
    ['=IMCONJUGATE("3+4i")', '3-4i'],
    ['=IMDIV("-238+240i","10+24i")', '5+12i'],
    ['=IMPOWER("2+3i",3)', '-46+9.00000000000001i'],
    ['=IMPOWER("2+3i",-10)', '-2.47735917765647E-06+1.05664872759202E-06i'],
    ['=IMPOWER("2+3i",-0.2502)', '0.703690251529252-0.176607830655576i'],
    ['=IMPOWER(-1000000000000000,3)', '-1E+45+3.67394039744206E+29i'],
    ['=IMSQRT(0.5)', '0.707106781186548'],
    ['=IMLOG10(2.8752)', '0.458668059764899'],
    ['=IMPRODUCT("3+4i","5-3i")', '27+11i'],
    ['=IMREAL("6-9i")', 6],
    ['=IMSQRT("1+i")', '1.09868411346781+0.455089860562227i'],
    ['=IMSUB("13+4i","5+3i")', '8+i'],
    ['=IMSUM("3+6i","5-2i")', '8+4i'],
    ['=IMSUM(1000000000000000,"5-2i")', '1000000000000000-2i'],
    ['=IMSUB(-1000000000000000,"5+3i")', '-1000000000000000-3i'],
  ])('%s handles common complex-number cases', (formula, expected) => {
    const actual = evaluate(formula);
    typeof expected === 'number' ? expect(actual).toBeCloseTo(expected, 12) : expect(actual).toEqual(expected);
  });

  it('BUG-323 divides equal nonzero complex values across extreme magnitudes', () => {
    for (const magnitude of ['1E200', '1E150', '1E-200', '1E-150']) {
      expect(evaluate(`=IMDIV("${magnitude}","${magnitude}")`)).toBe('1');
    }
    expect(evaluate('=IMDIV("1E200+1E200i","1E200+1E200i")')).toBe('1');
    expect(evaluate('=IMDIV("1E-200+1E-200i","1E-200+1E-200i")')).toBe('1');
    expect(evaluate('=IMDIV("1","0")')).toEqual({ kind: 'error', code: '#DIV/0!' });
  });

  it('BUG-338 rejects nondecimal complex-number text', () => {
    for (const formula of ['=IMREAL("0x10")', '=IMREAL("0b11")', '=IMAGINARY("0x10i")']) {
      expect(evaluate(formula)).toEqual({ kind: 'error', code: '#NUM!' });
    }
    expect(evaluate('=IMREAL("1.6E2+3i")')).toBe(160);
  });

  it('BUG-339 keeps mathematically zero complex components exact', () => {
    expect(evaluate('=IMSQRT("-1")')).toBe('i');
    expect(evaluate('=IMPOWER("-1",2)')).toBe('1');
    expect(evaluate('=IMPOWER("-1",3)')).toBe('-1');
    expect(evaluate('=IMSQRT("-4")')).toBe('2i');
    expect(evaluate('=IMREAL(IMSQRT("-1"))')).toBe(0);
    expect(evaluate('=IMAGINARY(IMPOWER("-1",2))')).toBe(0);
    expect(evaluate('=IMAGINARY(IMPOWER("-1",3))')).toBe(0);
    expect(evaluate('=IMREAL(IMSQRT("-4"))')).toBe(0);
  });

  it('BUG-1030 retains observable polar residuals for large negative real powers and roots', () => {
    expect(evaluate('=IMPOWER(-60,3)')).toBe('-216000+7.93571125847485E-11i');
    expect(evaluate('=IMPOWER(-1000000000000000,3)')).toBe('-1E+45+3.67394039744206E+29i');
    expect(evaluate('=IMSQRT(-1000000000000)')).toBe('6.12323399573677E-11+1000000i');
    expect(evaluate('=IMSQRT(-4)')).toBe('2i');
  });

  it('BUG-340 preserves the parity of large integer powers of negative real values', () => {
    expect(evaluate('=IMPOWER("-1",1E15)')).toBe('1');
    expect(evaluate('=IMPOWER("-1",1E15+1)')).toBe('-1');
    expect(evaluate('=IMREAL(IMPOWER("-1",1E15))')).toBe(1);
  });

  it('BUG-716 computes finite cotangents for tiny pure imaginary arguments', () => {
    expect(evaluate('=IMCOT(COMPLEX(0,1E-150))')).toBe('-1E+150i');
    expect(evaluate('=IMCOT(COMPLEX(0,-1E-150))')).toBe('1E+150i');
    expect(evaluate('=IMCSC(COMPLEX(0,1E-150))')).toBe('-1E+150i');
  });

  it('BUG-726 and BUG-1025 bound the real part of complex trigonometric arguments', () => {
    expect(Number(evaluate('=IMSIN(134217727)'))).toBeCloseTo(Math.sin(134217727), 12);
    expect(Number(evaluate('=IMCOS(-134217727)'))).toBeCloseTo(Math.cos(-134217727), 12);
    for (const formula of [
      '=IMSIN(134217728)', '=IMCOS(-134217728)', '=IMSIN(1E12)',
      '=IMCOS(1E12)', '=IMSIN(COMPLEX(1E12,1))',
    ]) expect(evaluate(formula)).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('BUG-736 keeps a finite complex product independent of factor order', () => {
    expect(evaluate('=IMPRODUCT(COMPLEX(1E200,1E200),COMPLEX(1E200,-1E200),COMPLEX(1E-200,0))'))
      .toBe('2E+200');
    expect(evaluate('=IMPRODUCT(COMPLEX(1E200,1E200),COMPLEX(1E-200,0),COMPLEX(1E200,-1E200))'))
      .toBe('2E+200');
    expect(evaluate('=IMPRODUCT(COMPLEX(1E200,1E200),COMPLEX(1E200,-1E200),0)')).toBe('0');
    expect(evaluate('=IMPRODUCT(1E-200,1E-200,1E200)')).toBe('1E-200');
  });

  it('BUG-737 keeps a finite complex sum independent of addend order', () => {
    expect(evaluate('=IMSUM(1E308,1E308,-1E308)')).toBe('1E+308');
    expect(evaluate('=IMSUM(1E308,-1E308,1E308)')).toBe('1E+308');
    expect(evaluate('=IMSUM(1E308,-1E308)')).toBe('0');
  });

  it.each([
    ['=IMCOT("4+3i")', '0.00490118239430447-0.999266927805902i'],
    ['=IMTAN("4+3i")', '0.00490825806749606+1.00070953606723i'],
    ['=IMCOT("4+400i")', '-i'],
    ['=IMTAN("4+400i")', 'i'],
  ])('%s preserves complex trigonometric precision', (formula, expected) => {
    expect(evaluate(formula)).toBe(expected);
  });

  it.each([
    'IMCOS',
    'IMCOSH',
    'IMCOT',
    'IMCOTH',
    'IMCSC',
    'IMCSCH',
    'IMEXP',
    'IMLN',
    'IMLOG10',
    'IMLOG2',
    'IMSEC',
    'IMSECH',
    'IMSIN',
    'IMSINH',
    'IMTAN',
    'IMTANH',
  ])('%s returns parseable complex text', (name) => {
    expect(evaluate(`=${name}("4+3i")`)).toEqual(expect.any(String));
  });

  it('IMLOG accepts an explicit logarithm base', () => {
    expect(evaluate('=IMLOG("8",2)')).toBe('3');
    expect(evaluate('=IMLOG("4+3i",10)')).toEqual(expect.any(String));
  });

  it('propagates complex division errors', () => {
    expect(evaluate('=IMCOTH(0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
  });

  it('BUG-322 rejects complex trigonometric arguments at the angle limit', () => {
    expect(evaluate('=IMCOS(1000000000000)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=IMSIN(-1000000000000000)')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('preserves small nonzero complex components and spreadsheet exponent notation', () => {
    expect(evaluate('=IMEXP(-61)')).toBe('3.22134028599252E-27');
    expect(evaluate('=IMEXP(1)')).toBe('2.718281828459045');
    expect(evaluate('=IMEXP(-10)')).toBe('0.0000453999297624849');
    expect(evaluate('=IMEXP(2.3755)')).toBe('10.7563900367701');
    expect(evaluate('=IMPOWER(-1.2503,3)')).toBe('-1.954531587527');
    expect(evaluate('=IMCONJUGATE("-0.000000000001")')).toBe('-0.000000000001');
  });

  it('rounds real exponentials at large and subnormal magnitudes', () => {
    expect(expToSpreadsheetPrecision(-745)).toBe(5e-324);
    expect(expToSpreadsheetPrecision(-300)).toBe(5.14820022241201e-131);
    expect(expToSpreadsheetPrecision(100)).toBe(2.68811714181614e43);
    expect(expToSpreadsheetPrecision(709)).toBe(8.21840746155497e307);
    expect(Number.isNaN(expToSpreadsheetPrecision(NaN))).toBe(true);
  });

  it('distinguishes boolean references from boolean literals in complex aggregates', () => {
    const logical = { ...context, getCellValue: () => true };
    for (const name of ['IMSUM', 'IMPRODUCT']) {
      expect(evaluate(`=${name}(TRUE,"5-2i")`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluator.evaluate(parser.parse(`=${name}(A1,"5-2i")`), logical))
        .toEqual({ kind: 'error', code: '#NUM!' });
      expect(evaluator.evaluate(parser.parse(`=${name}(IF(TRUE,A1,0),"5-2i")`), logical))
        .toEqual({ kind: 'error', code: '#NUM!' });
    }
  });

  it('rounds large complex sums and differences to WPS 15-digit precision', () => {
    const positive = { ...context, getCellValue: () => 1000000000000000 };
    const negative = { ...context, getCellValue: () => -1000000000000000 };
    expect(evaluator.evaluate(parser.parse('=IMSUM(IF(TRUE,A1,0),"5-2i")'), positive))
      .toBe('1000000000000000-2i');
    expect(evaluator.evaluate(parser.parse('=IMSUB(IF(TRUE,A1,0),"5+3i")'), negative))
      .toBe('-1000000000000000-3i');
    expect(evaluate('=IMSUM(1000000000000000,"5-2i")')).toBe('1000000000000000-2i');
    expect(evaluate('=IMSUB(-1000000000000000,"5+3i")')).toBe('-1000000000000000-3i');
    expect(evaluate('=IMSUM(1000000000000,"5-2i")')).toBe('1000000000005-2i');
    expect(evaluate('=IMSUB(-1000000000000,"5+3i")')).toBe('-1000000000005-3i');
  });

  it('uses the computed-value precision for the exponential of one', () => {
    const one = { ...context, getCellValue: () => 1 };
    expect(evaluate('=IMEXP(1)')).toBe('2.718281828459045');
    expect(evaluator.evaluate(parser.parse('=IMEXP(IF(TRUE,A1,0))'), one)).toBe('2.71828182845904');
  });

  it('supports current-sheet and workbook ranges for variadic functions', () => {
    expect(evaluate('=IMSUM(A1:A2)')).toBe('8+i');
    expect(evaluate('=IMPRODUCT(Inputs!A1:A2)')).toBe('27+11i');
  });

  it.each(['=IMREAL("")', '=IMABS("abc")', '=IMREAL("1+Xi")'])(
    '%s reports an invalid complex string as a numeric error',
    (formula) => {
      expect(evaluate(formula)).toEqual({ kind: 'error', code: '#NUM!' });
    },
  );

  it.each(['=COMPLEX(1,2,"x")', '=IMSUM("1+i","1+j")', '=IMREAL(TRUE)'])(
    '%s rejects an invalid complex argument type or suffix combination',
    (formula) => {
      expect(evaluate(formula)).toEqual({ kind: 'error', code: '#VALUE!' });
    },
  );
});

describe('conversion, comparison, arrays, and errors', () => {
  it.each([
    ['=BITAND(1.9,1)', 1],
    ['=BITOR(1.9,1)', 1],
    ['=BITXOR(1.9,1)', 0],
    ['=BITLSHIFT(1.9,1)', 2],
    ['=BITRSHIFT(3.9,1)', 1],
    ['=BITLSHIFT(1,1.9)', 2],
  ])('BUG-668 truncates decimal operands in %s', (formula, expected) => {
    expect(evaluate(formula)).toBe(expected);
  });

  it.each(['=BITAND("0x10",1)', '=BITOR("0x10",1)', '=BITXOR("0b11",1)'])
    ('BUG-669 rejects prefixed numeric text in %s', (formula) => {
      expect(evaluate(formula)).toEqual({ kind: 'error', code: '#VALUE!' });
    });

  it('BUG-982 rejects fractional numeric text without changing numeric operands', () => {
    for (const name of ['BITAND', 'BITOR', 'BITXOR', 'BITLSHIFT', 'BITRSHIFT']) {
      expect(evaluate(`=${name}("1.5",2)`)).toEqual({ kind: 'error', code: '#NUM!' });
    }
    expect(evaluate('=BITAND("10",1)')).toBe(0);
    expect(evaluate('=BITAND("1.0",1)')).toBe(1);
    expect(evaluate('=BITAND(1.9,1)')).toBe(1);
  });

  it('rejects fractional second operands in binary bitwise operations', () => {
    for (const [name, first] of [['BITAND', 13], ['BITOR', 23], ['BITXOR', 5]] as const) {
      for (const value of ['1e-12', '0.5', '1.005', '2.675']) {
        expect(evaluate(`=${name}(${first},${value})`)).toEqual({ kind: 'error', code: '#NUM!' });
      }
      expect(evaluate(`=${name}(1.9,1)`)).toBe(name === 'BITXOR' ? 0 : 1);
    }
  });

  it('BUG-238 raises metric prefixes to the dimension of squared units', () => {
    expect(convertUnit(1, 'km2', 'm2')).toBe(1_000_000);
    expect(convertUnit(1, 'm2', 'km2')).toBe(0.000001);
    expect(convertUnit(1, 'cm2', 'm2')).toBe(0.0001);
    expect(convertUnit(1, 'km', 'm')).toBe(1000);
  });

  it('BUG-239 preserves exact Celsius/Fahrenheit comparison points', () => {
    expect(convertUnit(0, 'C', 'F')).toBe(32);
    expect(convertUnit(-40, 'C', 'F')).toBe(-40);
    expect(convertUnit(32, 'F', 'C')).toBe(0);
    expect(evaluate('=CONVERT(0,"C","F")=32')).toBe(true);
    expect(evaluate('=CONVERT(-40,"C","F")=-40')).toBe(true);
  });

  it('BUG-240 recognizes common speed and cubic-meter unit codes', () => {
    expect(convertUnit(1, 'mph', 'km/hr')).toBeCloseTo(1.609344, 12);
    expect(convertUnit(1, 'kn', 'm/s')).toBeCloseTo(0.514444444444444, 12);
    expect(convertUnit(1, 'm3', 'l')).toBe(1000);
    expect(convertUnit(1000, 'l', 'm3')).toBe(1);
    expect(convertUnit(1, 'km3', 'm3')).toBe(1_000_000_000);
  });

  it('BUG-253 reserves binary prefixes for information units', () => {
    expect(convertUnit(1, 'Kig', 'g')).toEqual({ kind: 'error', code: '#N/A' });
    expect(convertUnit(1, 'Kibit', 'bit')).toBe(1024);
    expect(convertUnit(1, 'Mibyte', 'byte')).toBe(1024 ** 2);
    expect(convertUnit(1, 'kg', 'g')).toBe(1000);
  });

  it('BUG-341 rejects prefixed miles and feet', () => {
    expect(convertUnit(1, 'kmi', 'mi')).toEqual({ kind: 'error', code: '#N/A' });
    expect(convertUnit(1, 'mft', 'ft')).toEqual({ kind: 'error', code: '#N/A' });
    expect(convertUnit(1, 'mi', 'ft')).toBeCloseTo(5280, 10);
    expect(convertUnit(1, 'km', 'm')).toBe(1000);
  });

  it('BUG-342 preserves large finite values for identical units', () => {
    expect(convertUnit(9e307, 'km', 'km')).toBe(9e307);
    expect(convertUnit(9e307, 'm', 'm')).toBe(9e307);
    expect(convertUnit(9e307, 'invalid', 'invalid')).toEqual({ kind: 'error', code: '#N/A' });
  });
  it.each([
    ['=CONVERT(1,"mi","km")', 1.609344],
    ['=CONVERT(32,"F","C")', 0],
    ['=CONVERT(1,"kg","g")', 1000],
    ['=DELTA(5,5)', 1],
    ['=DELTA(5)', 0],
    ['=GESTEP(5,4)', 1],
    ['=GESTEP(-1)', 0],
  ])('%s handles common scenarios', (formula, expected) => expect(evaluate(formula)).toBeCloseTo(expected, 10));

  it('broadcasts scalar engineering formulas over rectangular arrays', () => {
    expect(evaluate('=DEC2HEX({10,11;12,13})')).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(evaluate('=BITAND({7;3},1)')).toEqual([[1], [1]]);
  });

  it.each(['=CONVERT(1,"m","g")', '=DELTA()', '=BITAND(1)', '=ERF(1,2,3)'])('%s validates arguments', (formula) => {
    expect(evaluate(formula)).toEqual(expect.objectContaining({ kind: 'error' }));
  });

  it('propagates formula errors', () => expect(evaluate('=DELTA(1/0,1)')).toEqual({ kind: 'error', code: '#DIV/0!' }));
});
