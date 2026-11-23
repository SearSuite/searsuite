import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { SearRegistryEntryNotFoundError } from './errors/SearAssemblyError';
import { SearContractViolationError } from './errors/SearAssemblyError';
import { SheetInteractionReducerRegistry } from './SheetInteractionReducerRegistry';
import { Platform } from '@searsuite/sear-foundation-platform';
import { runOutsideCommandExecution } from './CommandExecutionScope';

/**
 * A local interaction event. Event names and payloads are owned by the
 * feature that publishes and reduces them; Core only routes the event.
 */
export interface SheetInteractionSignal {
  type: string;
  [key: string]: unknown;
}

/** Public contract for SheetEditSession. */
export interface SheetEditSession {
  target: readonly [number, number];
  editor: string;
}

/** Public contract for SheetInteractionState. */
export interface SheetInteractionState {
  selection: {
    anchor: readonly [number, number];
    focus: readonly [number, number];
    source: string;
  } | null;
  /** Increments for every explicit selection transition. */
  selectionRevision: number;
  /** The selection revision consumed when the current/last edit session began. */
  suppressedSelectionRevision: number | null;
  editSession: SheetEditSession | null;
}

/**
 * Per-sheet, local-only interaction state. It deliberately does not use OT:
 * these transitions are view/session concerns and must never be synchronized.
 */
@Injectable()
export class SheetInteractionStore {
  /** DI token for resolving SheetInteractionStore. */
  public static readonly symbol = Symbol.for('SheetInteractionStore');

  #state: SheetInteractionState = Object.freeze({
    selection: null,
    selectionRevision: 0,
    suppressedSelectionRevision: null,
    editSession: null,
  });
  #commandBoundaryCheck: (() => boolean) | undefined;
  #runWithoutMutationAuthority: <Value>(callback: () => Value) => Value = runOutsideCommandExecution;
  private readonly listeners = new Set<
    (state: Readonly<SheetInteractionState>, signal: SheetInteractionSignal) => void
  >();

  /** Creates a SheetInteractionStore instance. */
  constructor(
    @Inject(SheetInteractionReducerRegistry.symbol)
    private readonly reducers: SheetInteractionReducerRegistry,
    @Inject(Platform.symbol) private readonly platform?: Platform,
  ) {}

  /** Requires an editor command for every assembled interaction-state commit. */
  public enforceCommandBoundary(
    isCommandExecuting: () => boolean,
    runWithoutMutationAuthority: <Value>(callback: () => Value) => Value = runOutsideCommandExecution,
  ): void {
    if (this.#commandBoundaryCheck) throw new SearContractViolationError('Interaction command boundary is already installed.');
    this.#commandBoundaryCheck = isCommandExecuting;
    this.#runWithoutMutationAuthority = runWithoutMutationAuthority;
  }

  /** Returns the state. */
  public getState(): Readonly<SheetInteractionState> {
    return this.#state;
  }

  /** Applies a transaction to SheetInteractionStore state. */
  public apply(signal: SheetInteractionSignal): void {
    this.#assertCommandBoundary();
    this.commit(this.reduce(this.#state, signal), [signal]);
  }

  /**
   * Reduces a signal without publishing it or changing the stored state.
   * Pipeline execution uses this to stage interaction transitions until every
   * other step has succeeded.
   * @param state - Interaction state visible before the signal.
   * @param signal - Local interaction transition to reduce.
   * @returns The prospective interaction state.
   */
  public reduce(state: Readonly<SheetInteractionState>, signal: SheetInteractionSignal): SheetInteractionState {
    const reducer = this.reducers.get(signal.type);
    if (!reducer)
      throw new SearRegistryEntryNotFoundError(
        'interaction reducer',
        signal.type,
        `No interaction reducer is registered for "${signal.type}".`,
      );
    return reducer.reduce(state, signal);
  }

  /**
   * Publishes a previously staged interaction state after pipeline commit.
   * @param state - Final interaction state to make visible.
   * @param signals - Ordered signals to deliver to subscribers.
   */
  public commit(state: SheetInteractionState, signals: readonly SheetInteractionSignal[]): void {
    this.#assertCommandBoundary();
    this.#state = Object.freeze({
      selectionRevision: state.selectionRevision,
      suppressedSelectionRevision: state.suppressedSelectionRevision,
      selection: state.selection ? Object.freeze({
        anchor: Object.freeze([...state.selection.anchor] as [number, number]),
        focus: Object.freeze([...state.selection.focus] as [number, number]),
        source: state.selection.source,
      }) : null,
      editSession: state.editSession ? Object.freeze({
        target: Object.freeze([...state.editSession.target] as [number, number]),
        editor: state.editSession.editor,
      }) : null,
    });
    signals.forEach((signal) => this.#runWithoutMutationAuthority(() => {
      [...this.listeners].forEach((listener) => {
        try {
          listener(this.#state, signal);
        } catch (error) {
          this.platform?.warn?.(`Sheet interaction listener failed for ${signal.type}.`, error);
        }
      });
    }));
  }

  #assertCommandBoundary(): void {
    if (this.#commandBoundaryCheck && !this.#commandBoundaryCheck()) {
      throw new SearContractViolationError('Sheet interaction changes must run through editor.commands.run(...).');
    }
  }

  /** Subscribes to state changes and returns an idempotent disposer. */
  public subscribe(
    listener: (state: Readonly<SheetInteractionState>, signal: SheetInteractionSignal) => void,
  ): () => void {
    this.listeners.add(listener);
    const store = this;
    return function unsubscribeSheetInteractionListener(): void {
      store.listeners.delete(listener);
    };
  }
}
