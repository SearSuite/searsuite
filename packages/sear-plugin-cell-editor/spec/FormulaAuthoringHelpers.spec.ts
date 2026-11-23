import { FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import { FunctionRegistry } from '@searsuite/sear-domain-formula-engine-ts';
import { cycleFormulaReference } from '../src/formulaAssist/cycleFormulaReference';
import { diagnoseFormulaInput } from '../src/formulaAssist/diagnoseFormulaInput';

describe('formula authoring helpers', () => {
  it('cycles a cell reference through the four Excel reference modes', () => {
    let text = '=A1+2';
    for (const expected of ['=$A$1+2', '=A$1+2', '=$A1+2', '=A1+2']) {
      const change = cycleFormulaReference(text, text.indexOf('1') + 1, text.indexOf('1') + 1);
      expect(change).not.toBeNull();
      text = text.slice(0, change!.start) + change!.replacement + text.slice(change!.end);
      expect(text).toBe(expected);
    }
  });

  it('cycles both ends of a qualified range and ignores text literals', () => {
    expect(cycleFormulaReference("=SUM('Sales Data'!A1:B3)", 23, 23)?.replacement).toBe("'Sales Data'!$A$1:$B$3");
    expect(cycleFormulaReference('="A1"+B2', 4, 4)).toBeNull();
    expect(cycleFormulaReference('=SUM(A1:B3)', 9, 9)?.replacement).toBe('$A$1:$B$3');
  });

  it('BUG-1114 cycles whole-column ranges without changing formula names or text', () => {
    expect(cycleFormulaReference('=SUM(A:A)', 8, 8)?.replacement).toBe('$A:$A');
    expect(cycleFormulaReference('=SUM($A:$A)', 10, 10)?.replacement).toBe('A:A');
    expect(cycleFormulaReference("=SUM('Sales Data'!AA:AB)", 23, 23)?.replacement)
      .toBe("'Sales Data'!$AA:$AB");
    expect(cycleFormulaReference('="A:A"+SUM(B:B)', 5, 5)).toBeNull();
  });

  it('BUG-884 does not cycle a function name that resembles an A1 reference', () => {
    expect(cycleFormulaReference('=LOG10(100)', 6, 6)).toBeNull();
    expect(cycleFormulaReference('=LOG10(A1)', 8, 8)?.replacement).toBe('$A$1');
  });

  it('distinguishes unfinished input from an invalid formula and exposes an error offset', () => {
    const parser = new FormulaParser();
    expect(diagnoseFormulaInput('=', parser)).toMatchObject({
      kind: 'incomplete', start: 1, end: 1,
    });
    expect(diagnoseFormulaInput('=SUM(A1', parser)).toMatchObject({
      kind: 'incomplete',
      start: 7,
      suggestion: 'Add a closing parenthesis.',
    });
    expect(diagnoseFormulaInput('=1+*2', parser)).toMatchObject({
      kind: 'error',
      start: 3,
      suggestion: 'Check the operator or value at this position.',
    });
    expect(diagnoseFormulaInput('=SUM(A1)', parser)).toBeNull();
    expect(diagnoseFormulaInput('plain text', parser)).toBeNull();
  });

  it('checks authoritative argument bounds and warns about unregistered functions', () => {
    const parser = new FormulaParser();
    const registry = new FunctionRegistry();
    expect(diagnoseFormulaInput('=IF(TRUE)', parser, registry)).toMatchObject({
      kind: 'error', message: 'IF requires at least 2 arguments.',
    });
    expect(diagnoseFormulaInput('=ABS(1,2)', parser, registry)).toMatchObject({
      kind: 'error', message: 'ABS accepts at most 1 arguments.',
    });
    expect(diagnoseFormulaInput('=MISSING(1)', parser, registry)).toMatchObject({
      kind: 'warning', message: 'MISSING is not a registered function.',
    });
    expect(diagnoseFormulaInput('=IF(TRUE,1,0)', parser, registry)).toBeNull();
  });
});
