import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

/** Optional host projection used only to prioritize pending formula work. */
export interface SheetFormulaPriorityProvider {
  readRange(): {
    readonly startRow: number;
    readonly endRow: number;
    readonly startCol: number;
    readonly endCol: number;
  };
  readOrigin(): { readonly row: number; readonly col: number };
  subscribe(listener: () => void): () => void;
}

/** Owns an optional work-priority projection without constructing a view. */
@Injectable()
export class SheetFormulaPriority {
  public static readonly symbol = Symbol.for('SheetFormulaPriority');
  #provider: SheetFormulaPriorityProvider | undefined;
  /** Attaches a projection before the owning scheduler starts. */
  public bind(provider: SheetFormulaPriorityProvider): void {
    if (this.#provider) throw new SearError('Sheet formula priority is already bound.');
    this.#provider = Object.freeze({
      readRange: provider.readRange.bind(provider),
      readOrigin: provider.readOrigin.bind(provider),
      subscribe: provider.subscribe.bind(provider),
    });
  }
  /** Reads the optional host work-priority projection. */
  public read(): SheetFormulaPriorityProvider | undefined {
    return this.#provider;
  }
}
