import { Injectable } from '@searsuite/sear-foundation-di';
import { assertSheetContributionWrite } from './SheetContributionWriteBoundary';

import { SearRegistryConflictError } from './errors/SearRegistryConflictError';
import { type SheetInteractionSignal, type SheetInteractionState } from './SheetInteractionStore';

/** Reduces one local interaction signal into the per-sheet interaction state. */
export interface SheetInteractionReducer {
  readonly type: string;
  reduce(state: Readonly<SheetInteractionState>, signal: SheetInteractionSignal): SheetInteractionState;
}

/** Extensible dispatch table for local interaction-state transitions. */
@Injectable()
export class SheetInteractionReducerRegistry {
  /** DI token for resolving SheetInteractionReducerRegistry. */
  public static readonly symbol = Symbol.for('SheetInteractionReducerRegistry');

  readonly #reducers = new Map<string, SheetInteractionReducer>();

  /** Registers the value. */
  public register(reducer: SheetInteractionReducer): () => void {
    assertSheetContributionWrite(this);
    if (this.#reducers.has(reducer.type)) {
      throw new SearRegistryConflictError(
        'interaction reducer',
        reducer.type,
        `An interaction reducer for "${reducer.type}" is already registered.`,
      );
    }
    const registered: SheetInteractionReducer = Object.freeze({
      type: reducer.type,
      reduce: reducer.reduce.bind(reducer),
    });
    this.#reducers.set(registered.type, registered);
    const registry = this;
    return function unregisterSheetInteractionReducer(): void {
      assertSheetContributionWrite(registry);
      if (registry.#reducers.get(registered.type) === registered) registry.#reducers.delete(registered.type);
    };
  }

  /** Returns the value. */
  public get(type: string): SheetInteractionReducer | undefined {
    return this.#reducers.get(type);
  }
}
