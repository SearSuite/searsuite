import {
  FormulaAddInServiceDefinition,
  FormulaErrorCode,
  FormulaServiceCacheStatus,
  type EvalContext,
  type FormulaAddInCall,
  type FormulaAddInRegistrationRequest,
  type FormulaValue,
  type FormulaAddInService,
} from '@searsuite/sear-domain-formula-engine';
import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaExternalServiceRegistry } from '../src/FormulaExternalServiceRegistry';
import { FormulaParser } from '../src/FormulaParser';
import { UnavailableFormulaAddInService } from '../src/UnavailableFormulaAddInService';
import { FunctionRegistry } from '../src/functions';

function evaluate(
  formula: string,
  service: FormulaAddInService = new UnavailableFormulaAddInService(),
  cells: Record<string, FormulaValue> = {},
): FormulaValue {
  const externalServices = new FormulaExternalServiceRegistry();
  externalServices.register(FormulaAddInServiceDefinition, service);
  const context: EvalContext = {
    getCellValue: (row, col) => cells[`${row},${col}`] ?? 0,
    isCellInBounds: () => true,
    iterateRange: function* () { yield 0; },
    externalServices,
  };
  return new FormulaEvaluator(new FunctionRegistry(), new AggregationCache())
    .evaluate(new FormulaParser().parse(formula), context);
}

describe('add-in and automation functions', () => {
  it('routes REGISTER.ID through the host service', () => {
    const requests: FormulaAddInRegistrationRequest[] = [];
    expect(evaluate('=REGISTER.ID("example","entry","JJ")', {
      resolveRegistration(request) {
        requests.push(request);
        return { status: FormulaServiceCacheStatus.Ready, value: 7 };
      },
      call: () => ({ status: FormulaServiceCacheStatus.Unavailable }),
    })).toBe(7);
    expect(requests).toEqual([{ module: 'example', procedure: 'entry', typeText: 'JJ' }]);
  });

  it('routes direct and registered CALL forms through the host service', () => {
    const calls: FormulaAddInCall[] = [];
    const service = {
      resolveRegistration: () => ({ status: FormulaServiceCacheStatus.Ready, value: 7 } as const),
      call(request: FormulaAddInCall) {
        calls.push(request);
        return { status: FormulaServiceCacheStatus.Ready, value: 42 } as const;
      },
    };
    expect(evaluate('=CALL("example","entry","JJ",1)', service)).toBe(42);
    expect(evaluate('=CALL(7,2)', service)).toBe(42);
    expect(calls).toEqual([
      { kind: 'direct', module: 'example', procedure: 'entry', typeText: 'JJ', arguments: [1] },
      { kind: 'registered', registrationId: 7, arguments: [2] },
    ]);
  });

  it('returns #N/A from the Web adapter without attempting native execution', () => {
    expect(evaluate('=REGISTER.ID("Kernel32","GetTickCount","J!")')).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=CALL("example","entry","JJ",1)')).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('validates CALL signatures and propagates argument errors', () => {
    const service: FormulaAddInService = {
      resolveRegistration: () => ({ status: FormulaServiceCacheStatus.Ready, value: 1 }),
      call: () => ({ status: FormulaServiceCacheStatus.Ready, value: 1 }),
    };
    expect(evaluate('=CALL()', service)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CALL("module","procedure")', service)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CALL(1,1/0)', service)).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=REGISTER.ID("module")', service)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=REGISTER.ID("module","procedure",1/0)', service)).toEqual({ kind: 'error', code: '#DIV/0!' });
  });
});

describe('EUROCONVERT', () => {
  it('keeps a finite result when triangulation precision exceeds representable digits', () => {
    const highPrecision = evaluate('=EUROCONVERT(1,"DEM","EUR",TRUE,400)');
    expect(highPrecision).toBe(evaluate('=EUROCONVERT(1,"DEM","EUR",TRUE,15)'));
    expect(highPrecision).toBeCloseTo(0.511291881196219, 14);
    expect(evaluate('=EUROCONVERT(1,"DEM","EUR",TRUE,3)')).toBe(0.511);
  });
  it('reports a numeric error when conversion exceeds finite range', () => {
    expect(evaluate('=EUROCONVERT(1E308,"EUR","ITL",TRUE)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=EUROCONVERT(100,"EUR","ITL",TRUE)')).toBe(193627);
  });
  it.each([
    ['=EUROCONVERT(A1,B1,C1)', { '0,0': 1.2, '0,1': 'DEM', '0,2': 'EUR' }, 0.61],
    ['=EUROCONVERT(A1,B1,C1,TRUE,3)', { '0,0': 1, '0,1': 'FRF', '0,2': 'EUR' }, 0.152],
    ['=EUROCONVERT(A1,B1,C1,FALSE,3)', { '0,0': 1, '0,1': 'FRF', '0,2': 'EUR' }, 0.15],
    ['=EUROCONVERT(A1,B1,C1,TRUE,3)', { '0,0': 1, '0,1': 'FRF', '0,2': 'DEM' }, 0.29728616],
  ] as const)('matches the source case %s', (formula, cells, expected) => {
    expect(evaluate(formula, undefined, cells)).toBe(expected);
  });

  it('supports every documented currency in both conversion directions', () => {
    const codes = ['ATS', 'BEF', 'DEM', 'ESP', 'EUR', 'FIM', 'FRF', 'GRD', 'IEP', 'ITL', 'LUF', 'NLG', 'PTE', 'SIT'];
    for (const code of codes) {
      const euros = evaluate(`=EUROCONVERT(100,"${code}","EUR",TRUE)`);
      expect(typeof euros).toBe('number');
      const roundTrip = evaluate(`=EUROCONVERT(${String(euros)},"EUR","${code}",TRUE)`);
      expect(roundTrip).toBeCloseTo(100, 10);
    }
  });

  it('handles common precision, casing, coercion, identity, and negative-value scenarios', () => {
    expect(evaluate('=EUROCONVERT(1,"frf","dem",TRUE,3)')).toBe(0.29728616);
    expect(evaluate('=EUROCONVERT(-1,"FRF","EUR",FALSE,3)')).toBe(-0.15);
    expect(evaluate('=EUROCONVERT("1.2","DEM","EUR")')).toBe(0.61);
    expect(evaluate('=EUROCONVERT(12.345,"DEM","DEM")')).toBe(12.345);
    expect(evaluate('=EUROCONVERT(1,"FRF","DEM",TRUE)')).toBeCloseTo(0.298164, 6);
  });

  it.each([
    '=EUROCONVERT(1,"EUR")',
    '=EUROCONVERT(1,"USD","EUR")',
    '=EUROCONVERT(1,"EUR","USD")',
    '=EUROCONVERT(1,"EUR","DEM",FALSE,2)',
    '=EUROCONVERT(1,"EUR","DEM",FALSE,3.5)',
    '=EUROCONVERT(1,"EUR","DEM","not-boolean")',
    '=EUROCONVERT("not-a-number","EUR","DEM")',
  ])('rejects invalid input: %s', (formula) => {
    expect(evaluate(formula)).toEqual({ kind: 'error', code: '#VALUE!' });
  });
});
