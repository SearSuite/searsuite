import {
  FormulaCubeServiceDefinition,
  FormulaServiceCacheStatus,
  type EvalContext,
  type FormulaCubeQuery,
  type FormulaCubeResult,
  type FormulaExternalServiceDefinition,
  type FormulaExternalServiceReader,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { AggregationCache, FormulaEvaluator, FormulaParser, FunctionRegistry } from '../src';

const member = { kind: 'cube-member', connection: 'Sales', expression: '[Time].[2004]', caption: 'FY 2004' } as const;
const set = { kind: 'cube-set', connection: 'Sales', expression: 'TopCount(...)', caption: 'Top products', count: 3 } as const;

function context(read: (query: FormulaCubeQuery) => FormulaCubeResult, cells: Record<string, FormulaValue> = {}): EvalContext {
  const service = { read: (query: FormulaCubeQuery) => ({ status: FormulaServiceCacheStatus.Ready, value: read(query) }), subscribeInvalidation: () => () => {} };
  const externalServices: FormulaExternalServiceReader = {
    get<T>(definition: FormulaExternalServiceDefinition<T>): T | undefined {
      return definition.id === FormulaCubeServiceDefinition.id ? service as T : undefined;
    },
  };
  return {
    externalServices,
    isCellInBounds: (row, col) => row >= 0 && row < 20 && col >= 0 && col < 20,
    getCellValue: (row, col) => cells[`${row},${col}`] ?? 0,
    *iterateRange(sr, sc, er, ec) {
      for (let row = sr; row <= er; row++) for (let col = sc; col <= ec; col++) yield cells[`${row},${col}`] ?? 0;
    },
  };
}

function evaluate(formula: string, evalContext: EvalContext): FormulaValue {
  return new FormulaEvaluator(new FunctionRegistry(), new AggregationCache()).evaluate(new FormulaParser().parse(formula), evalContext);
}

describe('Cube functions', () => {
  it('registers all seven functions', () => {
    const registry = new FunctionRegistry();
    expect(['CUBEKPIMEMBER', 'CUBEMEMBER', 'CUBEMEMBERPROPERTY', 'CUBERANKEDMEMBER', 'CUBESET', 'CUBESETCOUNT', 'CUBEVALUE'].every((name) => registry.has(name))).toBe(true);
  });

  it('preserves member identity while accepting tuple syntax and KPI names', () => {
    const queries: FormulaCubeQuery[] = [];
    const evalContext = context((query) => { queries.push(query); return member; }, {
      '0,0': member,
      '0,1': { ...member, expression: '[Product].[Food]', caption: 'Food' },
    });
    expect(evaluate('=CUBEMEMBER("Sales",(A1,B1),"SalesFor2004")', evalContext)).toEqual(member);
    expect(queries[0]).toMatchObject({ kind: 'member', expression: [member, expect.objectContaining({ expression: '[Product].[Food]' })] });
    expect(evaluate('=CUBEKPIMEMBER("Sales","MySalesKPI",KPIGoal,"Goal")', evalContext)).toEqual(member);
    expect(queries[1]).toEqual({ kind: 'kpi-member', connection: 'Sales', kpiName: 'MySalesKPI', property: 2, caption: 'Goal' });
  });

  it('supports set, count, ranked member, property, and value queries', () => {
    const queries: FormulaCubeQuery[] = [];
    const evalContext = context((query) => {
      queries.push(query);
      if (query.kind === 'set') return set;
      if (query.kind === 'ranked-member') return member;
      if (query.kind === 'member-property') return 'Calendar Year';
      if (query.kind === 'value') return 125.5;
      return 3;
    }, { '0,0': set, '0,1': member });
    expect(evaluate('=CUBESET("Sales","TopCount(...)","Top products")', evalContext)).toEqual(set);
    expect(evaluate('=CUBESETCOUNT(A1)', evalContext)).toBe(3);
    expect(evaluate('=CUBERANKEDMEMBER("Sales",A1,1)', evalContext)).toEqual(member);
    expect(evaluate('=CUBEMEMBERPROPERTY("Sales",B1,"Name")', evalContext)).toBe('Calendar Year');
    expect(evaluate('=CUBEVALUE("Sales",B1)', evalContext)).toBe(125.5);
    expect(queries.at(-1)).toEqual({ kind: 'value', connection: 'Sales', members: [member] });
  });

  it('returns #N/A while the host cache has no ready result', () => {
    const evalContext = context(() => member);
    delete (evalContext as { externalServices?: FormulaExternalServiceReader }).externalServices;
    expect(evaluate('=CUBEMEMBER("Sales","[Time].[2004]")', evalContext)).toEqual({ kind: 'error', code: '#N/A' });
  });

  it.each([
    '=CUBEKPIMEMBER("Sales","KPI")',
    '=CUBEMEMBER("Sales")',
    '=CUBEMEMBERPROPERTY("Sales","Member")',
    '=CUBERANKEDMEMBER("Sales","Set")',
    '=CUBESET("Sales")',
    '=CUBESETCOUNT()',
    '=CUBEVALUE()',
  ])('rejects missing required arguments: %s', (formula) => {
    expect(evaluate(formula, context(() => member))).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it.each([
    '=CUBEKPIMEMBER("Sales","KPI",1,"Caption","extra")',
    '=CUBEMEMBER("Sales","Member","Caption","extra")',
    '=CUBEMEMBERPROPERTY("Sales","Member","Name","extra")',
    '=CUBERANKEDMEMBER("Sales","Set",1,"Caption","extra")',
    '=CUBESET("Sales","Set","Caption",0,"Sort","extra")',
    '=CUBESETCOUNT(A1,A2)',
  ])('rejects excessive arguments: %s', (formula) => {
    expect(evaluate(formula, context(() => member, { '0,0': set, '1,0': set }))).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('validates KPI properties and supports all six named constants', () => {
    const properties: number[] = [];
    const evalContext = context((query) => {
      if (query.kind === 'kpi-member') properties.push(query.property);
      return member;
    });
    for (const name of ['KPIValue', 'KPIGoal', 'KPIStatus', 'KPITrend', 'KPIWeight', 'KPICurrentTimeMember']) {
      expect(evaluate(`=CUBEKPIMEMBER("Sales","KPI",${name})`, evalContext)).toEqual(member);
    }
    expect(properties).toEqual([1, 2, 3, 4, 5, 6]);
    expect(evaluate('=CUBEKPIMEMBER("Sales","KPI",0)', evalContext)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CUBEKPIMEMBER("Sales","KPI",7)', evalContext)).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('materializes range members without replacing their typed identities', () => {
    let captured: FormulaCubeQuery | undefined;
    const evalContext = context((query) => { captured = query; return member; }, {
      '0,0': member,
      '0,1': { ...member, expression: '[Product].[Food]', caption: 'Food' },
    });
    expect(evaluate('=CUBEMEMBER("Sales",A1:B1)', evalContext)).toEqual(member);
    expect(captured).toMatchObject({ kind: 'member', expression: [member, expect.objectContaining({ caption: 'Food' })] });
  });

  it('validates rank and set sorting options', () => {
    const queries: FormulaCubeQuery[] = [];
    const evalContext = context((query) => { queries.push(query); return query.kind === 'set' ? set : member; });
    expect(evaluate('=CUBERANKEDMEMBER("Sales","Top products",0)', evalContext)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CUBESET("Sales","Products","Caption",1)', evalContext)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CUBESET("Sales","Products","Caption",7)', evalContext)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CUBESET("Sales","Products","Caption",2,"[Measures].[Sales]")', evalContext)).toEqual(set);
    expect(queries.at(-1)).toMatchObject({ kind: 'set', sortOrder: 2, sortBy: '[Measures].[Sales]' });
  });

  it('loads set count when the set does not carry a cached count', () => {
    const countlessSet = { kind: 'cube-set', connection: 'Sales', expression: 'Products', caption: 'Products' } as const;
    expect(evaluate('=CUBESETCOUNT(A1)', context(() => 12, { '0,0': countlessSet }))).toBe(12);
    expect(evaluate('=CUBESETCOUNT("Products")', context(() => 12))).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('accepts omitted CUBEVALUE members and flattens range arguments', () => {
    const queries: FormulaCubeQuery[] = [];
    const evalContext = context((query) => { queries.push(query); return 42; }, {
      '0,0': member,
      '0,1': { ...member, expression: '[Measures].[Profit]', caption: 'Profit' },
    });
    expect(evaluate('=CUBEVALUE("Sales")', evalContext)).toBe(42);
    expect(evaluate('=CUBEVALUE("Sales",A1:B1)', evalContext)).toBe(42);
    expect(queries).toEqual([
      { kind: 'value', connection: 'Sales', members: [] },
      { kind: 'value', connection: 'Sales', members: [[member, expect.objectContaining({ caption: 'Profit' })]] },
    ]);
  });

  it('propagates formula and service errors', () => {
    expect(evaluate('=CUBEMEMBER(1/0,"Member")', context(() => member))).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=CUBEVALUE("Sales","Member")', context(() => ({ kind: 'error', code: '#NAME?' })))).toEqual({ kind: 'error', code: '#NAME?' });
  });

  it('rejects service results with the wrong semantic type', () => {
    const countlessSet = { kind: 'cube-set', connection: 'Sales', expression: 'Set', caption: 'Set' } as const;
    expect(evaluate('=CUBEMEMBER("Sales","Member")', context(() => 42))).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CUBESET("Sales","Set")', context(() => member))).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=CUBESETCOUNT(A1)', context(() => member, { '0,0': countlessSet }))).toEqual({ kind: 'error', code: '#VALUE!' });
  });
});
