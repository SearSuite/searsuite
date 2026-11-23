import { type SheetRangeMoveContext, type SheetRangeMoveContribution, type SheetRangeMovePlan, type SheetMoveRange } from './SheetRangeMoveContribution';
import { intersectSheetMoveRanges, subtractSheetMoveRange, translateSheetMoveRange } from './SheetMoveRangeGeometry';

/** A feature-owned rule and the rectangle it covers. */
export interface SheetRangeRuleEntry<Rule> {
  readonly range: SheetMoveRange;
  readonly rule: Rule;
}

/** One retained or relocated piece of an original rule. */
export interface SheetRangeRuleFragment<Rule> {
  readonly original: SheetRangeRuleEntry<Rule>;
  readonly range: SheetMoveRange;
  readonly placement: 'retained' | 'moved';
}

/** Feature-specific storage and operation mapping for splittable range rules. */
export interface SheetRangeRuleMoveAdapter<Rule> {
  readonly id: string;
  readRules(): readonly SheetRangeRuleEntry<Rule>[];
  validate?(context: SheetRangeMoveContext): void;
  plan(
    context: SheetRangeMoveContext,
    affected: readonly SheetRangeRuleEntry<Rule>[],
    fragments: readonly SheetRangeRuleFragment<Rule>[],
  ): readonly SheetRangeMovePlan[];
}

/** Creates a range-move contribution for rules that can be split at cell boundaries. */
export function createSheetRangeRuleMoveContribution<Rule>(adapter: SheetRangeRuleMoveAdapter<Rule>): SheetRangeMoveContribution {
  return {
    id: adapter.id,
    ...(adapter.validate ? { validate: (context: SheetRangeMoveContext) => adapter.validate?.(context) } : {}),
    hasConflict: ({ source, destination }) => adapter.readRules().some(({ range }) =>
      subtractSheetMoveRange(range, source).some((remaining) => intersectSheetMoveRanges(remaining, destination) !== null)),
    plan: (context) => {
      const { source, destination } = context;
      const affected = adapter.readRules().filter(({ range }) =>
        intersectSheetMoveRanges(range, source) || intersectSheetMoveRanges(range, destination));
      const fragments: SheetRangeRuleFragment<Rule>[] = [];
      for (const original of affected) {
        for (const remainder of subtractSheetMoveRange(original.range, source)) {
          for (const range of subtractSheetMoveRange(remainder, destination)) {
            fragments.push({ original, range, placement: 'retained' });
          }
        }
        const moving = intersectSheetMoveRanges(original.range, source);
        if (moving) {
          fragments.push({
            original,
            range: translateSheetMoveRange(moving, source, destination),
            placement: 'moved',
          });
        }
      }
      return adapter.plan(context, affected, fragments);
    },
  };
}
