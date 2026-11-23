import { SearError } from '@searsuite/sear-foundation-error';
import { assertSheetContributionWrite } from './SheetContributionWriteBoundary';
import type { SheetMoveRange } from './SheetRangeMoveContribution';
import type {
  SheetClipboardCapturedInstance, SheetClipboardTransferContribution, SheetClipboardTransferPlan,
  SheetClipboardTransferRequest, SheetPortableClipboardTransfer,
} from './SheetClipboardTransfer';

/** Editor-local transfer channel for persisted cell metadata other than formats. */
export class SheetClipboardTransferRegistry {
  public static readonly symbol = Symbol.for('SheetClipboardTransferRegistry');
  readonly #owners = new Map<string, SheetClipboardTransferContribution>();

  public register(owner: SheetClipboardTransferContribution): () => void {
    assertSheetContributionWrite(this);
    if (this.#owners.has(owner.id)) throw new SearError('Duplicate clipboard-transfer owner.', { ownerId: owner.id });
    const registered = Object.freeze({
      id: owner.id,
      capture: owner.capture.bind(owner),
      planCaptured: owner.planCaptured.bind(owner),
      ...(owner.clear ? { clear: owner.clear.bind(owner) } : {}),
    });
    this.#owners.set(owner.id, registered);
    return () => {
      assertSheetContributionWrite(this);
      if (this.#owners.get(owner.id) === registered) this.#owners.delete(owner.id);
    };
  }

  public capturePortable(source: SheetMoveRange): readonly SheetPortableClipboardTransfer[] {
    return [...this.#owners.values()].flatMap((owner) => {
      const portable = owner.capture(source);
      return portable === undefined ? [] : [{ id: owner.id, portable }];
    });
  }

  public planPortable(requests: readonly SheetClipboardTransferRequest[]): readonly SheetClipboardTransferPlan[] {
    const grouped = new Map<string, SheetClipboardCapturedInstance[]>();
    requests.forEach(({ captured, destination }) => captured.forEach(({ id, portable }) => {
      if (!this.#owners.has(id)) return;
      const instances = grouped.get(id) ?? [];
      instances.push({ portable, destination });
      grouped.set(id, instances);
    }));
    return [...grouped].flatMap(([id, instances]) => [
      ...(this.#owners.get(id)?.planCaptured(instances) ?? []),
    ]);
  }

  public clear(range: SheetMoveRange): readonly SheetClipboardTransferPlan[] {
    return [...this.#owners.values()].flatMap((owner) => [...(owner.clear?.(range) ?? [])]);
  }

  public destroy(): void {
    assertSheetContributionWrite(this);
    this.#owners.clear();
  }
}
