import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type Operation } from '@searsuite/sear-domain-ot';
import { type PluginKey } from './PluginKey';
import { type SheetMoveRange } from './SheetRangeMoveContribution';
import { assertSheetContributionWrite } from './SheetContributionWriteBoundary';

/** One stable row permutation within an inclusive cell range. */
export interface SheetRangeReorderContext {
  readonly range: SheetMoveRange;
  /** Maps a source row to its final row; columns never change. */
  readonly destinationOf: (row: number) => number;
}

export interface SheetRangeReorderPlan {
  readonly target: PluginKey;
  readonly operations: readonly Operation[];
}

/** State owners contribute atomic updates without exposing their matrices to the sorter. */
export interface SheetRangeReorderContribution {
  readonly id: string;
  validate?(context: SheetRangeReorderContext): void;
  plan(context: SheetRangeReorderContext): readonly SheetRangeReorderPlan[];
  transformPlans?(
    context: SheetRangeReorderContext,
    plans: readonly SheetRangeReorderPlan[],
  ): readonly SheetRangeReorderPlan[];
}

@Injectable()
export class SheetRangeReorderRegistry {
  public static readonly symbol = Symbol.for('SheetRangeReorderRegistry');
  readonly #contributions = new Map<string, SheetRangeReorderContribution>();

  public register(contribution: SheetRangeReorderContribution): () => void {
    assertSheetContributionWrite(this);
    if (this.#contributions.has(contribution.id))
      throw new SearError('Duplicate range-reorder contribution.', { id: contribution.id });
    const registered: SheetRangeReorderContribution = Object.freeze({
      id: contribution.id,
      ...(contribution.validate ? { validate: contribution.validate.bind(contribution) } : {}),
      plan: contribution.plan.bind(contribution),
      ...(contribution.transformPlans ? { transformPlans: contribution.transformPlans.bind(contribution) } : {}),
    });
    this.#contributions.set(registered.id, registered);
    return () => {
      assertSheetContributionWrite(this);
      if (this.#contributions.get(registered.id) === registered) this.#contributions.delete(registered.id);
    };
  }

  public plan(context: SheetRangeReorderContext): readonly SheetRangeReorderPlan[] {
    this.#contributions.forEach((owner) => owner.validate?.(context));
    let plans: readonly SheetRangeReorderPlan[] = [...this.#contributions.values()].flatMap((owner) =>
      [...owner.plan(context)]);
    this.#contributions.forEach((owner) => {
      plans = owner.transformPlans?.(context, plans) ?? plans;
    });
    return plans;
  }

  public destroy(): void { assertSheetContributionWrite(this); this.#contributions.clear(); }
}
