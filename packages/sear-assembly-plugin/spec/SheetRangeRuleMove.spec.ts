import {
  createSheetRangeRuleMoveContribution,
  intersectSheetMoveRanges,
  subtractSheetMoveRange,
  type SheetRangeRuleEntry,
  type SheetRangeRuleFragment,
} from '../src';

const source = { start: [1, 1], end: [2, 2] } as const;
const destination = { start: [3, 3], end: [4, 4] } as const;

describe('splittable Sheet range rules', () => {
  it('partitions a partial source rule and removes a partially covered destination rule', () => {
    const rules: SheetRangeRuleEntry<string>[] = [
      { range: { start: [0, 0], end: [2, 2] }, rule: 'source' },
      { range: { start: [2, 4], end: [4, 4] }, rule: 'target' },
    ];
    let affected: readonly SheetRangeRuleEntry<string>[] = [];
    let fragments: readonly SheetRangeRuleFragment<string>[] = [];
    const contribution = createSheetRangeRuleMoveContribution({
      id: 'test.rangeRules',
      readRules: () => rules,
      plan: (_context, nextAffected, nextFragments) => {
        affected = nextAffected;
        fragments = nextFragments;
        return [];
      },
    });
    const context = { source, destination };

    expect(contribution.hasConflict?.(context)).toBe(true);
    contribution.plan(context);
    expect(affected).toHaveLength(2);
    expect(fragments).toEqual([
      { original: rules[0], range: { start: [0, 0], end: [0, 2] }, placement: 'retained' },
      { original: rules[0], range: { start: [1, 0], end: [2, 0] }, placement: 'retained' },
      { original: rules[0], range: { start: [3, 3], end: [4, 4] }, placement: 'moved' },
      { original: rules[1], range: { start: [2, 4], end: [2, 4] }, placement: 'retained' },
    ]);
  });

  it('does not treat a source-owned overlap as a destination conflict', () => {
    const rule = { range: { start: [1, 1], end: [2, 2] } as const, rule: 'owned' };
    const contribution = createSheetRangeRuleMoveContribution({
      id: 'test.overlap', readRules: () => [rule], plan: () => [],
    });
    expect(contribution.hasConflict?.({
      source: { start: [0, 0], end: [2, 2] }, destination: { start: [2, 2], end: [4, 4] },
    })).toBe(false);
  });

  it('uses inclusive geometry without visiting cells', () => {
    expect(intersectSheetMoveRanges(
      { start: [0, 0], end: [1, 1] }, { start: [1, 1], end: [2, 2] },
    )).toEqual({ start: [1, 1], end: [1, 1] });
    expect(subtractSheetMoveRange(
      { start: [0, 0], end: [2, 2] }, { start: [1, 1], end: [1, 1] },
    )).toHaveLength(4);
  });
});
