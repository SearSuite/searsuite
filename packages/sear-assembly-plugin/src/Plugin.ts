import { Node, NodeProperties } from '@searsuite/sear-render-node';
import { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { ScrollManagerState } from '@searsuite/sear-render-scroll';
import { PluginKey } from './PluginKey';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { SearError } from '@searsuite/sear-foundation-error';
import { type OTOperation, type OTTransformRelation, type TransactionOTDefinition } from '@searsuite/sear-domain-ot';
import { type SessionStateRegistry } from './SessionStateRegistry';
import { SessionStateError, SessionStateErrorCode } from './SessionStateError';

/** Immutable identity and initial state used to construct a plugin instance. */
export interface PluginSpec<T> {
  /** Stable key under which the plugin registers state, config and scene nodes. */
  key: PluginKey;
  /** Initial state owned by the plugin. */
  state: T;
}

/** Controls whether a plugin state registration is exposed through DataEngine and collaboration. */
export type PluginDataViewFieldSelector<PluginStateType = unknown> = {
  /** Reads a data view field from the current plugin-owned state. */
  select(state: PluginStateType): unknown;
}['select'];

/** Describes one plugin-owned field exposed to a named DataEngine read-only view. */
export interface PluginDataViewFieldRegistration<PluginStateType = unknown> {
  /** Named data view that receives this field, such as a sheet-level read model. */
  readonly viewKey: string;
  /** Field name written into the named view. Duplicate names in one view are rejected by DataEngine. */
  readonly fieldKey: string;
  /** Reads the field value from the current plugin-owned state whenever the view is requested. */
  readonly select: PluginDataViewFieldSelector<PluginStateType>;
  /** When false, a missing state or void field does not make the containing view unavailable. */
  readonly required?: boolean;
}

/** Controls whether a plugin state registration is exposed through DataEngine and data views. */
export interface PluginDataEngineRegistrationOptions<PluginStateType = unknown> {
  /** When false, Core keeps the plugin private to PluginManager and skips DataEngine registration. */
  readonly enabled?: boolean;
  /** Field selectors contributed by this state to named read-only data views. */
  readonly dataView?: ReadonlyArray<PluginDataViewFieldRegistration<PluginStateType>>;
}

/** State registration returned by plugins during editor initialization. */
export interface PluginStateRegistration<PluginStateType = unknown> {
  /** Plugin key that owns the registered state. */
  readonly key: PluginKey;
  /** State value to register for that plugin key. */
  readonly state: PluginStateType;
  /** DataEngine exposure metadata for this state registration. */
  readonly dataEngine?: PluginDataEngineRegistrationOptions<PluginStateType>;
}

/**
 * Converts one plugin-owned transaction into history operations and rebases
 * retained history over transactions that committed later.
 */
export interface PluginTransactionHistoryAdapter {
  /** Creates the transaction that reverses the supplied committed transaction. */
  invert(transaction: Transaction): Transaction | null;
  /** Rebases a retained transaction over a transaction that committed later. */
  transform(transaction: Transaction, other: Transaction): Transaction | null;
}

/** Transaction algebra and collaboration metadata contributed by one state owner. */
export interface PluginTransactionOTContribution<OperationType extends OTOperation = OTOperation> {
  /** Stable wire identity independent from process-local PluginKey suffixes. */
  readonly ownerId: string;
  /** Versioned operation family used by history and collaboration. */
  readonly definition: TransactionOTDefinition<OperationType>;
  /** Explicit relations needed by third-party operation families. */
  readonly relations?: readonly OTTransformRelation[];
  /** Whether committed transactions owned by this plugin may cross a collaboration transport. */
  readonly collaborative?: boolean;
}

/** JSON-export codec shape supplied by a plugin-owned document-state module. */
export interface PluginDocumentStateCodec<TDocumentState extends object = object> {
  readonly key: string;
  serialize(state: TDocumentState): unknown | undefined;
  deserialize(payload: unknown, path: string): Partial<TDocumentState>;
}

/** Document-state export contribution owned by one plugin state owner. */
export interface PluginDocumentStateContribution<TOwnerState = unknown, TDocumentState extends object = object> {
  readonly key: string;
  capture(ownerState: TOwnerState): Partial<TDocumentState> | undefined;
  readonly codec: PluginDocumentStateCodec<TDocumentState>;
}

/** Default configuration contributed by one plugin during editor setup. */
export interface PluginConfigRegistration<ConfigType extends object = Record<string, unknown>> {
  /** Plugin key that owns this configuration unit. */
  readonly key: PluginKey;
  /** Plain configuration values consumed and wrapped by ConfigEngine. */
  readonly config: ConfigType;
}

/**
 * Base contract implemented by sheet and document plugins.
 *
 * Plugins own their state, declare lifecycle hooks, transform transactions into
 * state, and render scene nodes for their host core. Runtime packages should
 * extend this contract rather than reaching into Core internals.
 */
export abstract class Plugin<SearCoreType, NodeTypeProperties extends NodeProperties, PluginStateType> {
  /** Stable plugin key used by PluginManager and SceneGraph ownership maps. */
  public pluginKey: PluginKey;
  #state: PluginStateType;
  #stateCommitToken: object | undefined;
  #runtimeWriteCheck: (() => void) | undefined;
  #sessionStateRegistry: SessionStateRegistry | undefined;

  /** Draw and event ordering hint; lower values run earlier. */
  public readonly depth: number = 0;

  /** Whether PluginManager should warn when another ordered plugin shares this depth. */
  public readonly warnOnDuplicateDepth: boolean = true;

  /**
   * Declares which Sheet OT action names this plugin is interested in.
   * The engine will only call `apply` when a transaction contains
   * at least one operation matching these action names, unless the transaction
   * is owned by this plugin.
   *
   * - `['uc', 'rr', 'rc']` — only called for UpdateCell, ResizeRow, ResizeCol
   * - `['*']` — called for any transaction (wildcard)
   * - `[]` — only called for this plugin's own transactions
   */
  public interestedIn: string[] = [];

  /** Optional history behavior for transactions owned by this plugin. */
  public readonly transactionHistory?: PluginTransactionHistoryAdapter;

  /** Shared transaction algebra used by history and collaboration. */
  public readonly transactionOT?: PluginTransactionOTContribution;

  /** Document-state export modules owned by this plugin state. */
  public readonly documentState?:
    | PluginDocumentStateContribution<PluginStateType>
    | readonly PluginDocumentStateContribution<PluginStateType>[];

  /** Creates a plugin with its stable identity and initial state. */
  constructor({ key, state }: PluginSpec<PluginStateType>) {
    this.pluginKey = key;
    this.#state = state;
  }

  /** Returns the stable key that identifies this plugin instance. */
  public get key() {
    return this.pluginKey;
  }

  /** Returns the plugin-owned state currently registered with the manager. */
  public getState() {
    return this.#state;
  }

  /** Binds one plugin instance's session adapters to one editor-local registry. */
  protected registerOwnedSessionState(registry: SessionStateRegistry, register: () => void): void {
    if (this.#sessionStateRegistry && this.#sessionStateRegistry !== registry) {
      throw new SessionStateError(
        SessionStateErrorCode.registrationConflict,
        `Session state for "${this.pluginKey.key}" is already bound to an editor.`,
        { pluginKey: this.pluginKey.key },
      );
    }
    register();
    this.#sessionStateRegistry = registry;
  }

  /** Restricts state replacement to the owning editor's commit phase. */
  public enforceStateWriteBoundary(commitToken: object): void {
    if (this.#stateCommitToken) throw new SearError('Plugin state write boundary is already installed.');
    this.#stateCommitToken = commitToken;
  }

  /** Reports whether the owning runtime has taken control of state replacement. */
  public hasStateWriteBoundary(): boolean {
    return this.#stateCommitToken !== void 0;
  }

  /** Installs the editor's command check for plugin-owned runtime sessions. */
  public enforceRuntimeWriteBoundary(assertWrite: () => void): void {
    if (this.#runtimeWriteCheck) throw new SearError('Plugin runtime write boundary is already installed.');
    this.#runtimeWriteCheck = assertWrite;
    Object.defineProperty(this, 'assertRuntimeWriteAllowed', {
      value: Plugin.prototype.assertRuntimeWriteAllowed,
      writable: false,
      configurable: false,
    });
  }

  /** Guards methods that can be invoked through a retained prototype reference. */
  protected assertRuntimeWriteAllowed(): void {
    this.#runtimeWriteCheck?.();
  }

  /** Fixes transaction and export metadata after the editor takes ownership. */
  public sealRuntimeMetadata(): void {
    const interestedIn = Object.freeze([...(this.interestedIn ?? [])]);
    const transactionOT = this.transactionOT;
    if (transactionOT) {
      Object.freeze(transactionOT.definition);
      transactionOT.relations?.forEach((relation) => {
        Object.freeze(relation.left);
        Object.freeze(relation.right);
        Object.freeze(relation);
      });
      if (transactionOT.relations) Object.freeze(transactionOT.relations);
      Object.freeze(transactionOT);
    }
    const transactionHistory = this.transactionHistory;
    if (transactionHistory) Object.freeze(transactionHistory);
    const documentState = this.documentState;
    if (documentState) {
      const contributions = Array.isArray(documentState) ? documentState : [documentState];
      contributions.forEach((contribution) => {
        Object.freeze(contribution.codec);
        Object.freeze(contribution);
      });
      if (Array.isArray(documentState)) Object.freeze(documentState);
    }
    Object.defineProperties(this, {
      depth: { value: this.depth, writable: false, configurable: false },
      warnOnDuplicateDepth: { value: this.warnOnDuplicateDepth, writable: false, configurable: false },
      interestedIn: { value: interestedIn, writable: false, configurable: false },
      transactionOT: { value: transactionOT, writable: false, configurable: false },
      transactionHistory: { value: transactionHistory, writable: false, configurable: false },
      documentState: { value: documentState, writable: false, configurable: false },
    });
  }

  /** Pins transaction and render hooks after plugin startup. */
  public sealRuntimeMethods(): void {
    for (const name of [
      'apply', 'render', 'projectTransaction', 'onTransactionCommitted',
      'dirtyRect', 'onResize', 'onScroll', 'getPluginConfig',
    ]) {
      Object.defineProperty(this, name, {
        value: Reflect.get(this, name), writable: false, configurable: false,
      });
    }
  }

  /** Optionally locks a committed plugin-owned local state value against retained handles. */
  public lockCommittedState?(state: PluginStateType): void;

  /** Closes runtime-owned extension writes after every plugin has initialized and started. */
  public sealRuntimeWrites?(): void;

  /** Replaces the plugin-owned state after an apply or runtime transition. */
  public setState(state: PluginStateType, commitToken?: object) {
    if (this.#stateCommitToken && commitToken !== this.#stateCommitToken) {
      throw new SearError('Committed plugin state can only change through a command transaction.');
    }
    this.#state = state;
  }

  /**
   * Purely plans owner-targeted prerequisites before another owner's explicit transaction.
   * Sheet runtimes stage these once, atomically with the original transaction, and retain
   * them in the command pipeline for history and collaboration. Never mutate input state.
   */
  public projectTransaction?(state: PluginStateType, transaction: Transaction): readonly Transaction[];

  /** Applies a transaction to plugin-owned state and returns the next state. */
  public abstract apply(pluginState: PluginStateType, transaction: Transaction): PluginStateType | null;

  /**
   * Runs only after every step in the enclosing pipeline has succeeded and all
   * staged plugin state has been committed. Use it for derived caches,
   * notifications, persistence, and transport; never perform those effects in
   * {@link apply}, because a later pipeline step may still fail.
   * @param transaction - A committed transaction from the completed pipeline.
   */
  public onTransactionCommitted?(transaction: Transaction): void;

  /** Optional hook invoked when the host viewport or sheet dimensions change. */
  public onResize?(): void;

  /**
   * Receives one non-empty cell during SearCoreSheet's shared startup scan.
   * The scan runs once after every plugin state has been registered, so
   * plugins can build derived indexes without independently traversing the
   * whole sheet.
   */
  public onInitialDataCell?(searCore: SearCoreType, cell: unknown, row: number, col: number): void;

  /** Called after the final cell of the shared startup scan is delivered. */
  public onInitialDataComplete?(searCore: SearCoreType): void;

  /**
   * Plugin pointer event handlers.
   *
   * Return value contract:
   * - Return `false` to stop subsequent plugins from handling the same event.
   * - Return `true` / `undefined` / `void` to continue dispatching.
   *
   * This mechanism allows a plugin to explicitly suppress downstream handlers
   * after it has consumed an event, replacing the old coupled approach where
   * one plugin directly modified another plugin's state.
   */
  public onClick?(earCore: SearCoreType, event: EventWithOffsetAndTarget<NodeTypeProperties>): boolean | void;
  /** Handles a double-click pointer event. */
  public onDblClick?(earCore: SearCoreType, event: EventWithOffsetAndTarget<NodeTypeProperties>): boolean | void;
  /** Handles the start of a pointer press sequence. */
  public onMouseDown?(searCore: SearCoreType, event: EventWithOffsetAndTarget<NodeTypeProperties>): boolean | void;
  /** Handles pointer movement over the host surface. */
  public onMouseMove?(searCore: SearCoreType, event: EventWithOffsetAndTarget<NodeTypeProperties>): boolean | void;
  /** Handles the end of a pointer press sequence. */
  public onMouseUp?(searCore: SearCoreType, event: EventWithOffsetAndTarget<NodeTypeProperties>): boolean | void;

  /** Receives scroll state changes from the active scroll manager. */
  public onScroll?(scrollManagerState: ScrollManagerState): void;

  /** Produces scene nodes owned by this plugin for the current core state. */
  public abstract render(
    searCore: SearCoreType,
    offset?: { x: number; y: number },
  ): Node<NodeTypeProperties> | Node<NodeTypeProperties>[] | null;

  /**
   * Optional. Return the pixel-space dirty rectangle that needs to be
   * redrawn after this plugin processes `transaction`.
   *
   * When implemented, `SearCoreSheet.dispatch` will call `markDirty` with
   * the returned rect and skip a full-canvas re-render for this plugin.
   * When omitted (or when `null`/`undefined` is returned), dispatch falls
   * back to a full render pass.
   */
  public dirtyRect?(searCore: SearCoreType, transaction: Transaction): PositionRect<unknown> | null | undefined;

  /** Returns this plugin's runtime configuration view for the current core. */
  public abstract getPluginConfig(searCore: SearCoreType): unknown;

  /** Registers default configuration values owned by this plugin. */
  public registerConfig?(): PluginConfigRegistration[];
  /** Registers one or more plugin-owned state records with the host manager. */
  public abstract registerState(): PluginStateRegistration<PluginStateType> | Array<PluginStateRegistration>;
}
