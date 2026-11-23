import { completeFormulaForCommit } from '../src/formulaAssist/completeFormulaForCommit';

describe('completeFormulaForCommit', () => {
  it('closes a function call after a picked reference', () => {
    expect(completeFormulaForCommit('=SUM(D2:D4')).toBe('=SUM(D2:D4)');
    expect(completeFormulaForCommit('=IF(A1,SUM(B1:B3,MAX(C1:C2)')).toBe('=IF(A1,SUM(B1:B3,MAX(C1:C2)))');
  });

  it('preserves balanced and non-formula text', () => {
    expect(completeFormulaForCommit('=SUM(A1:A3)')).toBe('=SUM(A1:A3)');
    expect(completeFormulaForCommit('plain (text')).toBe('plain (text');
  });

  it('ignores quoted parentheses and leaves unfinished tokens alone', () => {
    expect(completeFormulaForCommit('=SUM("(",A1')).toBe('=SUM("(",A1)');
    expect(completeFormulaForCommit("=SUM('Sales (East)'!A1")).toBe("=SUM('Sales (East)'!A1)");
    expect(completeFormulaForCommit('=SUM(A1+')).toBe('=SUM(A1+');
    expect(completeFormulaForCommit('=SUM("unfinished')).toBe('=SUM("unfinished');
    expect(completeFormulaForCommit('=SUM(A1))')).toBe('=SUM(A1))');
  });
});
