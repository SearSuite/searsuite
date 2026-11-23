import type { IFunctionRegistry, FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { analyzeFormulaInput } from '../src/formulaAssist/FormulaInputAnalysis';

const functions: FormulaFunction[] = [
  {
    name: 'SUM',
    descriptor: {
      version: 1, category: 'Math', summary: 'Adds values.', example: '=SUM(A1:A5)',
      parameters: [{ name: 'number', description: 'Value to add.', repeating: true }],
    },
    evaluate: () => 0,
  },
  {
    name: 'IF',
    descriptor: {
      version: 1, category: 'Logical', summary: 'Tests a condition.', example: '=IF(A1,1,0)',
      parameters: [
        { name: 'test', description: 'Condition.' },
        { name: 'true_value', description: 'True result.' },
        { name: 'false_value', description: 'False result.' },
      ],
    },
    evaluate: () => 0,
  },
];

const registry: IFunctionRegistry = {
  enforceCommandBoundary: () => void 0,
  unregisterRegistration: () => void 0,
  list: () => functions.map((fn) => fn.name),
  get: (name) => functions.find((fn) => fn.name === name.toUpperCase()),
  has: (name) => functions.some((fn) => fn.name === name.toUpperCase()),
  register: () => () => void 0,
  registerMany: () => () => void 0,
  subscribe: () => () => void 0,
};

describe('analyzeFormulaInput', () => {
  it('finds registered functions in an unfinished formula and preserves the replacement range', () => {
    const result = analyzeFormulaInput('=su', 3, registry);
    expect(result.suggestions).toEqual([{
      name: 'SUM', summary: 'Adds values.', category: 'Math', example: '=SUM(A1:A5)',
    }]);
    expect([result.replaceStart, result.replaceEnd]).toEqual([1, 3]);
    expect(analyzeFormulaInput('plain su', 8, registry).suggestions).toEqual([]);
    expect(analyzeFormulaInput('="SU"', 4, registry).suggestions).toEqual([]);
    expect(analyzeFormulaInput("='SU'!A1", 4, registry).suggestions).toEqual([]);
  });

  it('tracks nested calls, quoted commas and array separators', () => {
    const nested = '=IF(SUM({1,2;3,4}),"a,b",';
    const result = analyzeFormulaInput(nested, nested.length, registry);
    expect(result.signature).toMatchObject({ name: 'IF', parameterIndex: 2 });
    expect(analyzeFormulaInput('=SUM(1,', 7, registry).signature).toMatchObject({
      name: 'SUM', parameterIndex: 1,
    });
  });

  it('uses the live registry for third-party functions', () => {
    functions.push({ name: 'CUSTOM_TOTAL', evaluate: () => 0 });
    expect(analyzeFormulaInput('=CUS', 4, registry).suggestions).toEqual([{ name: 'CUSTOM_TOTAL' }]);
    functions.pop();
  });
});
