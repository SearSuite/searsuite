import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type Operation } from '@searsuite/sear-domain-ot';
import { type SheetStructureMoveContribution, type SheetStructureMoveContext } from './SheetStructureMoveContribution';
import { assertSheetContributionWrite } from './SheetContributionWriteBoundary';

/** Editor-local preflight and operation planning for complete-axis structure edits. */
@Injectable()
export class SheetStructureMoveRegistry {
  public static readonly symbol = Symbol.for('SheetStructureMoveRegistry');
  readonly #contributions = new Map<string, SheetStructureMoveContribution>();

  /** Registers one contribution with order-independent, idempotent disposal. */
  public register(contribution: SheetStructureMoveContribution): () => void {
    assertSheetContributionWrite(this);
    if (this.#contributions.has(contribution.id))
      throw new SearError('Duplicate structure-move contribution.', { id: contribution.id });
    const registered: SheetStructureMoveContribution = Object.freeze({
      id: contribution.id,
      ...(contribution.validate ? { validate: contribution.validate.bind(contribution) } : {}),
      ...(contribution.transformOperations
        ? { transformOperations: contribution.transformOperations.bind(contribution) }
        : {}),
    });
    this.#contributions.set(registered.id, registered);
    return () => {
      assertSheetContributionWrite(this);
      if (this.#contributions.get(registered.id) === registered) this.#contributions.delete(registered.id);
    };
  }

  /** Validates the original intent before compiling dependent operation updates. */
  public plan(context: SheetStructureMoveContext): readonly Operation[] {
    if (context.operations.length === 0) return [];
    this.#contributions.forEach((owner) => owner.validate?.(context));
    let operations = context.operations;
    this.#contributions.forEach((owner) => {
      operations = owner.transformOperations?.({ ...context, operations }) ?? operations;
    });
    return operations;
  }

  /** Releases editor-owned contributions. */
  public destroy(): void {
    assertSheetContributionWrite(this);
    this.#contributions.clear();
  }
}
