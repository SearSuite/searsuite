import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { NodeProperties } from '@searsuite/sear-render-node';
import { Transaction } from '@searsuite/sear-domain-transaction';
import {
  OTTransformPriority,
  TransactionOTRegistry,
  type Operation,
  type OTOperation,
  type TransactionOTDefinition,
} from '@searsuite/sear-domain-ot';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { Plugin, type PluginDocumentStateContribution } from './Plugin';
import { PluginKey } from './PluginKey';

/** Document-state export contribution bound to the plugin instance that owns the source state. */
export interface RegisteredPluginDocumentStateContribution {
  readonly plugin: Plugin<unknown, NodeProperties, unknown>;
  readonly contribution: PluginDocumentStateContribution<unknown>;
}

/** Ordered registry that owns plugin instances for one core/editor runtime. */
@Injectable()
export class PluginManager<SearCoreType, NodeTypeProperties extends NodeProperties> {
  /** DI token for resolving the runtime plugin manager. */
  public static readonly symbol: symbol = Symbol.for('PluginManager');

  readonly #plugins = new Map<string, Plugin<SearCoreType, NodeTypeProperties, any>>();
  readonly #collaborationOwners = new Map<string, Plugin<SearCoreType, NodeTypeProperties, any>>();
  readonly #transactionOTDisposers = new Map<string, Array<() => void>>();
  readonly #transactionOTRegistry = new TransactionOTRegistry();
  #writeToken: object | undefined;

  /** Creates a PluginManager bound to the host diagnostics channel when available. */
  constructor(private readonly platform?: Platform) {}

  /** Gives the owning runtime exclusive registry write access after assembly. */
  public enforceWriteBoundary(token: object): void {
    if (this.#writeToken) throw new SearError('Plugin manager write boundary is already installed.');
    this.#writeToken = token;
    Object.preventExtensions(this);
  }

  private assertWritable(token?: object): void {
    if (this.#writeToken && token !== this.#writeToken) {
      throw new SearError('Plugin registry changes require the owning runtime.');
    }
  }

  /** Returns all registered plugins in insertion order. */
  public getAllPlugins(): Plugin<SearCoreType, NodeTypeProperties, any>[] {
    return [...this.#plugins.values()];
  }

  /** Removes all registered plugins during host teardown. */
  public clearPlugins(token?: object): void {
    this.assertWritable(token);
    for (const plugin of this.#plugins.values()) clearPluginState(plugin);
    [...this.#transactionOTDisposers.values()]
      .reverse()
      .forEach((disposers) => [...disposers].reverse().forEach((dispose) => dispose()));
    this.#transactionOTDisposers.clear();
    this.#collaborationOwners.clear();
    this.#plugins.clear();
  }

  /** Registers a plugin under its key and rejects duplicate ownership. */
  public registerPlugin<T>(plugin: Plugin<SearCoreType, NodeTypeProperties, T>, token?: object): void {
    this.assertWritable(token);
    if (Plugin.prototype.hasStateWriteBoundary.call(plugin)) {
      throw new SearError('Plugin state is already owned by another editor.');
    }
    if (this.#plugins.has(plugin.key.key)) throw new SearError(`Plugin with key ${plugin.key.key} already exists.`);
    this.warnSameDepthRegistration(plugin);
    this.registerTransactionOT(plugin);
    this.#plugins.set(plugin.key.key, plugin);
  }

  /** Unregisters a plugin and clears the manager-owned state reference. */
  public unregisterPlugin(pluginOrKey: Plugin<SearCoreType, NodeTypeProperties, any> | PluginKey | string, token?: object): void {
    this.assertWritable(token);
    const key = getPluginKeyString(pluginOrKey);
    const plugin = this.#plugins.get(key);
    if (!plugin) return;
    this.disposeTransactionOT(plugin);
    clearPluginState(plugin);
    this.#plugins.delete(key);
  }

  /** Returns the state owned by a registered plugin key, if present. */
  public getPluginState<T>(key: PluginKey): T | undefined {
    const plugin = this.#plugins.get(key.key);
    return plugin ? plugin.getState() : void 0;
  }

  /** Returns the history adapter contributed by a transaction's state owner. */
  public getTransactionHistoryAdapter(transaction: Transaction) {
    return this.#plugins.get(transaction.pluginKey.key)?.transactionHistory;
  }

  /** Returns the shared transaction OT contribution for one local transaction owner. */
  public getTransactionOTContribution(transaction: Transaction) {
    return this.#plugins.get(transaction.pluginKey.key)?.transactionOT;
  }

  /** Lists collaborative transaction owners registered in this runtime. */
  public getCollaborativeTransactionPlugins(): readonly Plugin<SearCoreType, NodeTypeProperties, any>[] {
    return [...this.#collaborationOwners.values()];
  }

  /** Lists document-state export contributions registered by plugin state owners. */
  public getDocumentStateContributions(): readonly RegisteredPluginDocumentStateContribution[] {
    return this.getAllPlugins().flatMap((plugin) =>
      readPluginDocumentStateContributions(plugin).map((contribution) => ({
        plugin: plugin as unknown as Plugin<unknown, NodeProperties, unknown>,
        contribution,
      })),
    );
  }

  /** Resolves a stable collaboration owner to its editor-local plugin instance. */
  public getCollaborativeTransactionPlugin(ownerId: string) {
    return this.#collaborationOwners.get(ownerId);
  }

  /** Inverts a transaction through its owner's registered OT definition. */
  public invertTransaction(transaction: Transaction): Transaction | null {
    const contribution = this.getRequiredTransactionOT(transaction);
    const inverted = this.#transactionOTRegistry.invert(contribution.definition, transaction.operations);
    return inverted.length > 0 ? createTransaction(transaction.pluginKey, inverted as Operation[]) : null;
  }

  /** Rebases a retained transaction over another committed transaction through the shared registry. */
  public transformTransaction(transaction: Transaction, other: Transaction): Transaction | null {
    const contribution = this.getRequiredTransactionOT(transaction);
    const otherContribution = this.getRequiredTransactionOT(other);
    const transformed = this.#transactionOTRegistry.transformPair(
      contribution.definition,
      transaction.operations,
      otherContribution.definition,
      other.operations,
      OTTransformPriority.RIGHT,
    ).left;
    return transformed.length > 0
      ? createTransaction(transaction.pluginKey, transformed as Operation[], transaction.meta)
      : null;
  }

  /** Visits plugins in depth order so event, apply and render flows stay deterministic. */
  public forEach(callbackfn: (plugin: Plugin<SearCoreType, NodeTypeProperties, any>) => void) {
    const plugins = [...this.#plugins.values()].sort(comparePluginDepth);
    for (const plugin of plugins) callbackfn(plugin);
  }

  private warnSameDepthRegistration(plugin: Plugin<SearCoreType, NodeTypeProperties, any>): void {
    if (!plugin.warnOnDuplicateDepth) return;
    const depth = plugin.depth ?? 0;
    const existing = [...this.#plugins.values()].filter(function hasSamePluginDepth(registered) {
      return registered.warnOnDuplicateDepth && (registered.depth ?? 0) === depth;
    });
    if (existing.length === 0) return;
    this.platform?.warn?.(
      `Plugin ${plugin.key.key} has the same depth ${depth} as ${existing
        .map(function readPluginKey(registered) {
          return registered.key.key;
        })
        .join(
          ', ',
        )}; runtime order will follow registration order. Use distinct depth values for deterministic priority.`,
    );
  }

  private registerTransactionOT(plugin: Plugin<SearCoreType, NodeTypeProperties, any>): void {
    const contribution = plugin.transactionOT;
    if (!contribution) return;
    const disposers: Array<() => void> = [this.#transactionOTRegistry.registerType(contribution.definition)];
    contribution.relations?.forEach((relation) =>
      disposers.push(this.#transactionOTRegistry.registerRelation(relation)),
    );
    if (contribution.collaborative) {
      this.warnMissingCollaborativeDocumentState(plugin, contribution.ownerId);
      const existing = this.#collaborationOwners.get(contribution.ownerId);
      if (existing && existing !== plugin) {
        disposers.reverse().forEach((dispose) => dispose());
        throw new SearError(`Collaborative transaction owner ${contribution.ownerId} already exists.`);
      }
      this.#collaborationOwners.set(contribution.ownerId, plugin);
    }
    this.#transactionOTDisposers.set(plugin.key.key, disposers);
  }

  private warnMissingCollaborativeDocumentState(
    plugin: Plugin<SearCoreType, NodeTypeProperties, any>,
    ownerId: string,
  ): void {
    if (readPluginDocumentStateContributions(plugin).length > 0) return;
    this.platform?.warn?.(
      `Collaborative plugin ${plugin.key.key} (${ownerId}) has no sear-plugin-export document-state contribution.`,
    );
  }

  private disposeTransactionOT(plugin: Plugin<SearCoreType, NodeTypeProperties, any>): void {
    const contribution = plugin.transactionOT;
    if (contribution && this.#collaborationOwners.get(contribution.ownerId) === plugin) {
      this.#collaborationOwners.delete(contribution.ownerId);
    }
    const disposers = this.#transactionOTDisposers.get(plugin.key.key) ?? [];
    [...disposers].reverse().forEach((dispose) => dispose());
    this.#transactionOTDisposers.delete(plugin.key.key);
  }

  private getRequiredTransactionOT(transaction: Transaction): {
    readonly definition: TransactionOTDefinition<OTOperation>;
  } {
    const contribution = this.getTransactionOTContribution(transaction);
    if (contribution) return contribution;
    throw new SearError(`Transaction owner ${transaction.pluginKey.key} has no transaction OT contribution.`);
  }
}

function readPluginDocumentStateContributions<SearCoreType, NodeTypeProperties extends NodeProperties>(
  plugin: Plugin<SearCoreType, NodeTypeProperties, any>,
): readonly PluginDocumentStateContribution<unknown>[] {
  const contribution = plugin.documentState;
  if (!contribution) return [];
  return (Array.isArray(contribution) ? [...contribution] : [contribution]) as PluginDocumentStateContribution<unknown>[];
}

function getPluginKeyString<SearCoreType, NodeTypeProperties extends NodeProperties>(
  pluginOrKey: Plugin<SearCoreType, NodeTypeProperties, any> | PluginKey | string,
): string {
  if (typeof pluginOrKey === 'string') return pluginOrKey;
  if (pluginOrKey instanceof Plugin) return pluginOrKey.key.key;
  return pluginOrKey.key;
}

function clearPluginState<SearCoreType, NodeTypeProperties extends NodeProperties>(
  plugin: Plugin<SearCoreType, NodeTypeProperties, any>,
): void {
  // The core owns guarded document state; dropping the manager reference is enough.
  if (!Plugin.prototype.hasStateWriteBoundary.call(plugin)) plugin.setState(void 0);
}

function comparePluginDepth<SearCoreType, NodeTypeProperties extends NodeProperties>(
  left: Plugin<SearCoreType, NodeTypeProperties, any>,
  right: Plugin<SearCoreType, NodeTypeProperties, any>,
): number {
  return (left.depth ?? 0) - (right.depth ?? 0);
}
