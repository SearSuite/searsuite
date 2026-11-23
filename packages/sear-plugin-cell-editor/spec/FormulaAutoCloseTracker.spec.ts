import { FormulaAutoCloseTracker } from '../src/formulaAssist/FormulaAutoCloseTracker';

describe('FormulaAutoCloseTracker', () => {
  it('follows inserted references and consumes only a tracked closing parenthesis', () => {
    const tracker = new FormulaAutoCloseTracker();
    tracker.add(5);
    tracker.reconcile('=SUM()', '=SUM(D2:D4)');
    expect(tracker.consume(10, '=SUM(D2:D4)')).toBe(true);
    expect(tracker.consume(10, '=SUM(D2:D4)')).toBe(false);
    expect(tracker.consume(5, '=SUM()')).toBe(false);
  });

  it('drops markers removed by an edit and restores only valid positions', () => {
    const tracker = new FormulaAutoCloseTracker();
    tracker.add(5);
    tracker.reconcile('=SUM()', '=SUM(');
    expect(tracker.snapshot()).toEqual([]);
    tracker.restore([5, 9], '=SUM()');
    expect(tracker.snapshot()).toEqual([5]);
  });
});
