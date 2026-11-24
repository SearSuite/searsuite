import {
  SearCoreSheet,
  type SheetLifecycleContext,
  type SheetLifecycleController,
} from '@searsuite/sear-assembly-core';
import { Plugin, PluginKey, PluginManager } from '@searsuite/sear-assembly-plugin';
import { createSheetTransaction, LocalActionCommand, TransactionPipelineCommand, SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-core';
import { type Operation } from '@searsuite/sear-domain-ot';
import { TRANSACTION_ORIGIN_META_KEY, Transaction, TransactionOrigin } from '@searsuite/sear-domain-transaction';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { CollaborationChannelBinding, type CollaborationChannel } from '../CollaborationChannel';
import { CollaborationStatusObservation } from '../CollaborationObservation';
import { type CollaborationConnectOptions, type CollaborationSession } from '../CollaborationSession';
import { type CollaborationStatus } from '../CollaborationStatus';
import {
  ApplyRemoteOperationsCommand,
  ApplySheetCollaborationEventCommand,
  ConnectSheetCollaborationCommand,
  DisconnectSheetCollaborationCommand,
} from '../SheetCollabCommands';

const pluginKey = new PluginKey('SheetCollaboration');

/** Thin Sheet bridge around the editor-independent collaboration engine. */
@Injectable()
export class SheetCollaborationPlugin
  extends Plugin<SearCoreSheet, CellProperties, null>
  implements SheetLifecycleController, CollaborationSession
{
  readonly #channelBinding: CollaborationChannelBinding;
  readonly #plugins: PluginManager<SearCoreSheet, CellProperties>;
  readonly #commands: SheetCommandBus;

  public static readonly symbol = Symbol.for('SheetCollaborationPlugin');
  public override readonly warnOnDuplicateDepth = false;
  public override readonly interestedIn = ['*'];

  readonly #registeredOwnerIds = new Set<string>();
  #detachRemoteApplier: (() => void) | null = null;
  #destroyed = false;

  public constructor(
    @Inject(CollaborationChannelBinding.symbol)
    channelBinding: CollaborationChannelBinding,
    @Inject(PluginManager.symbol)
    plugins: PluginManager<SearCoreSheet, CellProperties>,
    @Inject(SheetCommandBus.symbol) commands: SheetCommandBus,
  ) {
    super({ key: pluginKey, state: null });
    this.#channelBinding = channelBinding;
    this.#plugins = plugins;
    this.#commands = commands;
    this.#registerContributors();
  }

  get #channel(): CollaborationChannel {
    return this.#channelBinding.channel;
  }

  public registerCommands(commands: SheetCommandBus): void {
    const bridge = this;
    commands.register(ConnectSheetCollaborationCommand, (input) => ({
      id: ConnectSheetCollaborationCommand.id,
      execute() {
        const result = {
          pipeline: new Pipeline(ConnectSheetCollaborationCommand.id),
          completion: Promise.resolve(),
        };
        result.pipeline.addLocalAction(ConnectSheetCollaborationCommand.id, () => {
          result.completion = bridge.connect(input);
        });
        return result;
      },
    }));
    commands.register(DisconnectSheetCollaborationCommand, () =>
      new LocalActionCommand(DisconnectSheetCollaborationCommand.id, () => bridge.disconnect()));
    commands.register(ApplySheetCollaborationEventCommand, (event) =>
      new LocalActionCommand(ApplySheetCollaborationEventCommand.id, () => bridge.#channel.applyExternalEvent(event)));
    commands.register(ApplyRemoteOperationsCommand, function createApplyRemoteOperationsCommand(input) {
      const owner = bridge.#plugins.getCollaborativeTransactionPlugin(input.ownerId);
      if (!owner) throw new SearError(`Collaborative Sheet owner "${input.ownerId}" is not registered.`);
      return new TransactionPipelineCommand(
        ApplyRemoteOperationsCommand.id,
        createSheetTransaction(owner.key, [...input.operations], {
          [TRANSACTION_ORIGIN_META_KEY]: TransactionOrigin.Remote,
        }),
      );
    });
  }

  public registerObservations(observations: ObservationRegistry): void {
    observations.register(CollaborationStatusObservation, {
      getSnapshot: this.getStatus.bind(this),
      subscribe: (listener) => this.#channel.subscribeStatus(listener),
    });
  }

  public async connect(options: CollaborationConnectOptions): Promise<void> {
    await this.#channel.connect(options);
  }

  public disconnect(): void {
    this.#channel.disconnect();
  }

  public getStatus(): CollaborationStatus {
    return this.#channel.getStatus();
  }

  public start(_context: SheetLifecycleContext): void {
    this.#registerContributors();
    this.#detachRemoteApplier = this.#channel.attachRemoteApplier((effect) => {
      this.#commands.run(ApplyRemoteOperationsCommand, {
        ownerId: effect.ownerId,
        operations: effect.operations as readonly Operation[],
      });
    });
  }

  public destroy(): void {
    this.assertRuntimeWriteAllowed();
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#detachRemoteApplier?.();
    this.#detachRemoteApplier = null;
    if (this.#channelBinding.owner === 'editor') this.#channel.destroy();
  }

  public override onTransactionCommitted(transaction: Transaction): void {
    if (transaction.getMeta<TransactionOrigin>(TRANSACTION_ORIGIN_META_KEY) === TransactionOrigin.Remote) return;
    const contribution = this.#plugins.getTransactionOTContribution(transaction);
    if (!contribution?.collaborative || transaction.operations.length === 0) return;
    this.#channel.submitLocal(contribution.ownerId, transaction.operations);
  }

  public apply(_state: null, _transaction: Transaction): null {
    return null;
  }

  public render(): null {
    return null;
  }

  public getPluginConfig(): null {
    return null;
  }

  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  #registerContributors(): void {
    this.#plugins.getCollaborativeTransactionPlugins().forEach((plugin) => {
      const contribution = plugin.transactionOT;
      if (!contribution?.collaborative || this.#registeredOwnerIds.has(contribution.ownerId)) return;
      this.#channel.registerContributor({
        ownerId: contribution.ownerId,
        definition: contribution.definition,
        ...(contribution.relations ? { relations: contribution.relations } : {}),
      });
      this.#registeredOwnerIds.add(contribution.ownerId);
    });
  }
}
