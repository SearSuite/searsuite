import { SearError } from '@searsuite/sear-foundation-error';
import { assertSheetContributionWrite } from './SheetContributionWriteBoundary';
import {
  type SheetFormatRange,
  type SheetFormatTransferContribution,
  type SheetFormatTransferSnapshot,
  type SheetFormatTransferPlan,
  type SheetPortableFormatTransfer,
} from './SheetFormatTransfer';

/** Editor-local composition of state-owner format transfers. */
export class SheetFormatTransferRegistry {
  public static readonly symbol = Symbol.for('SheetFormatTransferRegistry');
  readonly #owners = new Map<string, SheetFormatTransferContribution>();

  public register(owner: SheetFormatTransferContribution): () => void {
    assertSheetContributionWrite(this);
    if (this.#owners.has(owner.id)) throw new SearError('Duplicate format-transfer owner.', { ownerId: owner.id });
    const registered: SheetFormatTransferContribution = Object.freeze({
      id: owner.id,
      ...(owner.capture ? { capture: owner.capture.bind(owner) } : {}),
      ...(owner.singleCellFillStep ? { singleCellFillStep: owner.singleCellFillStep.bind(owner) } : {}),
      ...(owner.usedExtent ? { usedExtent: owner.usedExtent.bind(owner) } : {}),
      ...(owner.planCaptured ? { planCaptured: owner.planCaptured.bind(owner) } : {}),
      ...(owner.clear ? { clear: owner.clear.bind(owner) } : {}),
    });
    this.#owners.set(registered.id, registered);
    return () => {
      assertSheetContributionWrite(this);
      if (this.#owners.get(registered.id) === registered) this.#owners.delete(registered.id);
    };
  }

  public capture(source: SheetFormatRange): SheetFormatTransferSnapshot {
    const snapshots = [...this.#owners.values()].flatMap((owner) => {
      const snapshot = owner.capture?.(source);
      return snapshot ? [{ id: owner.id, plan: snapshot.plan.bind(snapshot), portable: snapshot.portable }] : [];
    });
    return {
      plan: (destination, targetRegistry = this) => snapshots.flatMap(({ id, plan, portable }) => {
        if (targetRegistry === this) return [...plan(destination)];
        const target = targetRegistry.#owners.get(id);
        if (!target) return [];
        if (!target.planCaptured || portable === void 0) {
          throw new SearError('Format-transfer owner cannot apply across Sheets.', { ownerId: id });
        }
        return [...target.planCaptured(portable, destination)];
      }),
    };
  }

  public singleCellFillStep(row: number, column: number): number | null {
    for (const owner of this.#owners.values()) {
      const step = owner.singleCellFillStep?.(row, column);
      if (step != null) return step;
    }
    return null;
  }

  public usedExtent(lastRow: number, lastColumn: number): readonly [number, number] | null {
    let row = -1;
    let column = -1;
    for (const owner of this.#owners.values()) {
      const extent = owner.usedExtent?.(lastRow, lastColumn);
      if (!extent) continue;
      row = Math.max(row, extent[0]);
      column = Math.max(column, extent[1]);
    }
    return row < 0 ? null : [row, column];
  }

  public capturePortable(source: SheetFormatRange): readonly SheetPortableFormatTransfer[] {
    return [...this.#owners.values()].flatMap((owner) => {
      if (!owner.planCaptured) return [];
      const portable = owner.capture?.(source)?.portable;
      return portable === void 0 ? [] : [{ id: owner.id, portable }];
    });
  }

  public planPortable(
    captured: readonly SheetPortableFormatTransfer[],
    destination: SheetFormatRange,
  ): readonly SheetFormatTransferPlan[] {
    return captured.flatMap(({ id, portable }) => [
      ...(this.#owners.get(id)?.planCaptured?.(portable, destination) ?? []),
    ]);
  }

  /** Plans all format owners against the same unchanged pre-clear state. */
  public clear(range: SheetFormatRange): readonly SheetFormatTransferPlan[] {
    return [...this.#owners.values()].flatMap((owner) => [...(owner.clear?.(range) ?? [])]);
  }

  public destroy(): void {
    assertSheetContributionWrite(this);
    this.#owners.clear();
  }
}
