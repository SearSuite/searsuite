import { FormulaRefShifter } from '../src/FormulaRefShifter';
import {
  IFormulaParser,
  FormulaNodeKind,
  type FormulaAST,
  type StructureChange,
} from '@searsuite/sear-domain-formula-engine';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';

describe('FormulaRefShifter', () => {
  it('shifts references for formulas that are affected', () => {
    const mockParser: IFormulaParser = {
      parse: jest.fn(),
      extractDependencies: jest.fn(),
      shiftReferences: jest.fn((ast: FormulaAST, changes: StructureChange[]) => {
        if (changes.length > 0 && ast.kind === FormulaNodeKind.String && ast.value === 'shift-me') {
          return { ...ast, value: 'shifted' };
        }
        return ast;
      }),
    };

    const shifter = new FormulaRefShifter(mockParser);

    const formulas = new Map<number, FormulaAST>();
    const ast1: FormulaAST = { kind: FormulaNodeKind.String, value: 'shift-me' };
    const ast2: FormulaAST = { kind: FormulaNodeKind.String, value: 'leave-me' };

    formulas.set(1, ast1);
    formulas.set(2, ast2);

    const changes: StructureChange[] = [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }];
    const result = shifter.shiftAll(formulas, changes);

    expect(mockParser.shiftReferences).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe(1);
    expect(result[0].newAst).toEqual({ kind: FormulaNodeKind.String, value: 'shifted' });
  });
});
