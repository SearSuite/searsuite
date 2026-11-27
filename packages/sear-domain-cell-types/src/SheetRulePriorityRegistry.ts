import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { assertCellExtensionWrite } from './CellExtensionWriteBoundary';

/** Shared ordering of independently owned cell rules, without a presentation registry. */
@Injectable()
export class SheetRulePriorityRegistry {
  public static readonly symbol = Symbol.for('SheetRulePriorityRegistry');
  readonly #sources = new Map<string, () => number>();

  public register(id: string, readHighestPriority: () => number): () => void {
    assertCellExtensionWrite(this);
    if (this.#sources.has(id)) throw new SearError(`Rule priority source ${id} is already registered.`);
    this.#sources.set(id, readHighestPriority);
    return () => {
      assertCellExtensionWrite(this);
      if (this.#sources.get(id) === readHighestPriority) this.#sources.delete(id);
    };
  }

  public nextPriority(): number {
    let highest = 0;
    for (const read of this.#sources.values()) {
      const value = read();
      if (!Number.isFinite(value)) throw new SearError('Rule priorities must be finite numbers.');
      highest = Math.max(highest, value);
    }
    return highest + 1;
  }
}
