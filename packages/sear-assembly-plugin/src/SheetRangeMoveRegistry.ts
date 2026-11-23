import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { SheetRangeMoveStatus, type SheetRangeMoveAnalysis } from './SheetRangeMoveAnalysis';
import { SheetRangeMoveRejectedError } from './SheetRangeMoveRejectedError';
import { assertSheetContributionWrite } from './SheetContributionWriteBoundary';
import {
  type SheetRangeMoveContext,
  type SheetRangeMoveContribution,
  type SheetRangeMovePlan,
} from './SheetRangeMoveContribution';

/** Editor-local range-move planning extension point shared by state owners. */
@Injectable()
export class SheetRangeMoveRegistry {
  public static readonly symbol = Symbol.for('SheetRangeMoveRegistry');
  readonly #contributions = new Map<string, SheetRangeMoveContribution>();

  /** Registers one owner and returns an idempotent disposer. */
  public register(contribution: SheetRangeMoveContribution): () => void {
    assertSheetContributionWrite(this);
    if (this.#contributions.has(contribution.id)) throw new SearError(`Duplicate range-move owner: ${contribution.id}`);
    const registered: SheetRangeMoveContribution = Object.freeze({
      id: contribution.id,
      ...(contribution.validate ? { validate: contribution.validate.bind(contribution) } : {}),
      ...(contribution.hasConflict ? { hasConflict: contribution.hasConflict.bind(contribution) } : {}),
      plan: contribution.plan.bind(contribution),
      ...(contribution.transformPlans ? { transformPlans: contribution.transformPlans.bind(contribution) } : {}),
    });
    this.#contributions.set(registered.id, registered);
    return () => {
      assertSheetContributionWrite(this);
      if (this.#contributions.get(registered.id) === registered) this.#contributions.delete(registered.id);
    };
  }

  /** Validates all owners before testing destination conflicts. */
  public hasConflict(context: SheetRangeMoveContext): boolean {
    const analysis = this.analyze(context);
    if (analysis.status === SheetRangeMoveStatus.Blocked) throw new SheetRangeMoveRejectedError(analysis);
    return analysis.status === SheetRangeMoveStatus.RequiresConfirmation;
  }

  /** Assesses all owner constraints without planning or publishing any mutation. */
  public analyze(context: SheetRangeMoveContext): SheetRangeMoveAnalysis {
    for (const owner of this.#contributions.values()) {
      try {
        owner.validate?.(context);
      } catch (error) {
        if (!(error instanceof SearError)) throw error;
        return {
          status: SheetRangeMoveStatus.Blocked,
          context,
          issue: { ownerId: owner.id, code: error.code, message: error.message, details: error.details },
        };
      }
    }
    const conflict = [...this.#contributions.values()].some((owner) => owner.hasConflict?.(context) === true);
    return { context, status: conflict ? SheetRangeMoveStatus.RequiresConfirmation : SheetRangeMoveStatus.Allowed };
  }

  /** Plans all owners against the same pre-move state. */
  public plan(context: SheetRangeMoveContext): readonly SheetRangeMovePlan[] {
    const analysis = this.analyze(context);
    if (analysis.status === SheetRangeMoveStatus.Blocked) throw new SheetRangeMoveRejectedError(analysis);
    let plans: readonly SheetRangeMovePlan[] = [...this.#contributions.values()].flatMap((owner) => [
      ...owner.plan(context),
    ]);
    this.#contributions.forEach((owner) => {
      if (owner.transformPlans) plans = owner.transformPlans(context, plans);
    });
    return plans;
  }

  /** Releases all editor-owned registrations. */
  public destroy(): void {
    assertSheetContributionWrite(this);
    this.#contributions.clear();
  }
}
