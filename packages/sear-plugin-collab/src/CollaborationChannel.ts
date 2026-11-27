import {
  CollaborationContributorRegistry,
  CollaborationEngine,
  type CollaborationContribution,
  type CollaborationEngineEffect,
  type CollaborationServerMessage,
} from '@searsuite/sear-domain-collaboration';
import { TransactionOTRegistry, type OTOperation } from '@searsuite/sear-domain-ot';
import { runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { type CollabTransport } from './CollabTransport';
import { CollaborationChannelError, CollaborationChannelErrorCode } from './CollaborationChannelError';
import { type CollaborationConnectOptions, type CollaborationSession } from './CollaborationSession';
import { CollaborationConnectionState, type CollaborationStatus } from './CollaborationStatus';

/** Remote operation batch delivered to the currently mounted editor bridge. */
export interface CollaborationRemoteOperations {
  readonly ownerId: string;
  readonly operations: readonly OTOperation[];
  readonly serverRevision: number;
}

export type CollaborationRemoteOperationApplier = (effect: CollaborationRemoteOperations) => void;

/** Transport event returned to the owning editor's command bus. */
export type CollaborationExternalEvent =
  | { readonly kind: 'connected'; readonly epoch: number; readonly resourceId: string }
  | { readonly kind: 'failed'; readonly epoch: number; readonly resourceId: string; readonly error: unknown }
  | { readonly kind: 'message'; readonly epoch: number; readonly message: CollaborationServerMessage };

/**
 * Long-lived collaboration resource channel shared by standalone and embedded editors.
 * It is the sole owner of transport, revision, pending submissions, ACK handling and rebase state.
 */
export class CollaborationChannel implements CollaborationSession {
  readonly #platform: Pick<Platform, 'warn' | 'createId'>;

  readonly #operations = new TransactionOTRegistry();
  readonly #contributors = new CollaborationContributorRegistry(this.#operations);
  readonly #engine = new CollaborationEngine(this.#contributors);
  readonly #registeredContributors = new Map<string, CollaborationContribution>();
  readonly #statusListeners = new Set<(status: CollaborationStatus) => void>();
  readonly #queuedRemoteEffects: CollaborationRemoteOperations[] = [];
  #remoteApplier: CollaborationRemoteOperationApplier | null = null;
  #disposeTransportListener: (() => void) | null = null;
  #transportActive = false;
  #transport: CollabTransport | null;
  readonly #transportFactory: () => CollabTransport;
  #destroyed = false;
  #connectionEpoch = 0;
  #assertWrite: (() => void) | null = null;
  #dispatchExternalEvent: ((event: CollaborationExternalEvent) => void) | null = null;
  #runWithoutMutationAuthority: <Value>(callback: () => Value) => Value = runOutsideCommandExecution;
  #status: CollaborationStatus = Object.freeze({
    state: CollaborationConnectionState.Disconnected,
    resourceId: null,
    revision: 0,
    pendingCount: 0,
    error: null,
  });

  public constructor(
    transport: CollabTransport | (() => CollabTransport),
    platform: Pick<Platform, 'warn' | 'createId'>,
  ) {
    this.#platform = platform;
    this.#transport = typeof transport === 'function' ? null : transport;
    this.#transportFactory = typeof transport === 'function' ? transport : () => transport;
  }

  /** Restricts public channel mutations after its owning editor finishes assembly. */
  public enforceCommandBoundary(
    assertWrite: () => void,
    runWithoutMutationAuthority: <Value>(callback: () => Value) => Value = runOutsideCommandExecution,
    dispatchExternalEvent: (event: CollaborationExternalEvent) => void,
  ): void {
    if (this.#assertWrite) {
      throw new CollaborationChannelError(
        CollaborationChannelErrorCode.BoundaryInstalled,
        'Collaboration channel command boundary is already installed.',
      );
    }
    this.#assertWrite = assertWrite;
    this.#runWithoutMutationAuthority = runWithoutMutationAuthority;
    this.#dispatchExternalEvent = dispatchExternalEvent;
    Object.freeze(this);
  }

  /** Installs one open OT owner contract for the lifetime of this channel. */
  public registerContributor(contribution: CollaborationContribution): void {
    this.#assertLive();
    const existing = this.#registeredContributors.get(contribution.ownerId);
    if (existing) {
      if (existing.definition === contribution.definition) return;
      throw new CollaborationChannelError(
        CollaborationChannelErrorCode.ContributorConflict,
        `Collaboration owner "${contribution.ownerId}" changed operation definitions while its channel was alive.`,
        { ownerId: contribution.ownerId },
      );
    }
    this.#assertWrite?.();
    const registered: CollaborationContribution = Object.freeze({
      ownerId: contribution.ownerId,
      definition: contribution.definition,
      ...(contribution.relations ? { relations: Object.freeze([...contribution.relations]) } : {}),
    });
    this.#contributors.register(registered.ownerId, registered.definition, registered.relations);
    this.#registeredContributors.set(registered.ownerId, registered);
  }

  /** Attaches the one currently mounted editor and replays queued remote effects in revision order. */
  public attachRemoteApplier(applier: CollaborationRemoteOperationApplier): () => void {
    this.#assertLive();
    this.#assertWrite?.();
    if (this.#remoteApplier) {
      throw new CollaborationChannelError(
        CollaborationChannelErrorCode.AttachmentConflict,
        'A collaboration channel cannot be attached to two editor runtimes at once.',
        { resourceId: this.#status.resourceId },
      );
    }
    this.#remoteApplier = applier;
    this.#flushRemoteEffects();
    let attached = true;
    return () => {
      this.#assertWrite?.();
      if (!attached) return;
      attached = false;
      if (this.#remoteApplier === applier) this.#remoteApplier = null;
    };
  }

  public async connect(options: CollaborationConnectOptions): Promise<void> {
    this.#assertLive();
    this.#assertWrite?.();
    const connectionEpoch = this.#connectionEpoch + 1;
    this.disconnect();
    if (connectionEpoch !== this.#connectionEpoch) return;
    const revision = options.revision ?? 0;
    this.#engine.connect(options.resourceId, this.#platform.createId('client'), revision);
    this.#updateStatus(CollaborationConnectionState.Connecting, options.resourceId, null);
    if (connectionEpoch !== this.#connectionEpoch) return;
    try {
      const transport = this.#requireTransport();
      this.#disposeTransportListener = transport.subscribe((message) => {
        this.#routeExternalEvent({ kind: 'message', epoch: connectionEpoch, message });
      });
      this.#transportActive = true;
      await transport.connect({ url: options.url, resourceId: options.resourceId, revision });
      if (connectionEpoch !== this.#connectionEpoch) return;
      this.#routeExternalEvent({ kind: 'connected', epoch: connectionEpoch, resourceId: options.resourceId });
    } catch (error) {
      if (connectionEpoch !== this.#connectionEpoch) throw error;
      this.#routeExternalEvent({ kind: 'failed', epoch: connectionEpoch, resourceId: options.resourceId, error });
      throw error;
    }
  }

  public disconnect(): void {
    if (this.#destroyed) return;
    this.#assertWrite?.();
    this.#closeConnection();
  }

  #closeConnection(): void {
    this.#connectionEpoch += 1;
    this.#releaseTransport();
    this.#engine.disconnect();
    this.#queuedRemoteEffects.length = 0;
    this.#updateStatus(CollaborationConnectionState.Disconnected, null, null);
  }

  public getStatus(): CollaborationStatus {
    return this.#status;
  }

  public subscribeStatus(listener: (status: CollaborationStatus) => void): () => void {
    this.#assertLive();
    this.#statusListeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#statusListeners.delete(listener);
    };
  }

  /** Queues a committed local operation batch through the shared collaboration engine. */
  public submitLocal(ownerId: string, operations: readonly OTOperation[]): void {
    this.#assertLive();
    this.#assertWrite?.();
    if (this.#status.state !== CollaborationConnectionState.Online || operations.length === 0) return;
    this.#processEffects(this.#engine.submitLocal(ownerId, operations));
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#assertWrite?.();
    this.#destroyed = true;
    this.#closeConnection();
    this.#remoteApplier = null;
    this.#statusListeners.clear();
    this.#registeredContributors.clear();
    this.#contributors.destroy();
    this.#operations.destroy();
  }

  /** Applies one transport event while the owning editor dispatches its command. */
  public applyExternalEvent(event: CollaborationExternalEvent): void {
    this.#assertWrite?.();
    if (this.#destroyed || event.epoch !== this.#connectionEpoch) return;
    if (event.kind === 'connected') {
      this.#updateStatus(CollaborationConnectionState.Online, event.resourceId, null);
      return;
    }
    if (event.kind === 'failed') {
      this.#releaseTransport();
      this.#engine.disconnect();
      this.#updateStatus(CollaborationConnectionState.Error, event.resourceId, event.error);
      return;
    }
    try {
      this.#processEffects(this.#engine.receive(event.message));
    } catch (error) {
      this.#updateStatus(CollaborationConnectionState.Error, this.#status.resourceId, error);
      this.#platform.warn('Collaboration channel message failed.', error);
    }
  }

  #routeExternalEvent(event: CollaborationExternalEvent): void {
    if (this.#dispatchExternalEvent) this.#dispatchExternalEvent(event);
    else this.applyExternalEvent(event);
  }

  #processEffects(effects: readonly CollaborationEngineEffect[]): void {
    effects.forEach((effect) => {
      if (effect.kind === 'send') {
        this.#requireTransport().send(effect.submission);
        return;
      }
      this.#queuedRemoteEffects.push({
        ownerId: effect.ownerId,
        operations: effect.operations,
        serverRevision: effect.serverRevision,
      });
      this.#flushRemoteEffects();
    });
    this.#updateStatus(this.#status.state, this.#status.resourceId, this.#status.error);
  }

  #flushRemoteEffects(): void {
    while (this.#remoteApplier && this.#queuedRemoteEffects.length > 0) {
      const effect = this.#queuedRemoteEffects[0];
      if (!effect) return;
      this.#remoteApplier(effect);
      this.#queuedRemoteEffects.shift();
    }
  }

  #releaseTransport(): void {
    this.#disposeTransportListener?.();
    this.#disposeTransportListener = null;
    if (this.#transportActive) this.#transport?.disconnect();
    this.#transportActive = false;
  }

  #requireTransport(): CollabTransport {
    if (!this.#transport) this.#transport = this.#transportFactory();
    return this.#transport;
  }

  #updateStatus(state: CollaborationStatus['state'], resourceId: string | null, error: unknown | null): void {
    this.#status = Object.freeze({
      state,
      resourceId,
      revision: state === CollaborationConnectionState.Disconnected ? 0 : this.#engine.getRevision(),
      pendingCount: state === CollaborationConnectionState.Disconnected ? 0 : this.#engine.getPendingCount(),
      error,
    });
    this.#runWithoutMutationAuthority(() => {
      this.#statusListeners.forEach((listener) => {
        try {
          listener(this.#status);
        } catch (listenerError) {
          this.#platform.warn('Collaboration status listener failed.', listenerError);
        }
      });
    });
  }

  #assertLive(): void {
    if (!this.#destroyed) return;
    throw new CollaborationChannelError(
      CollaborationChannelErrorCode.Destroyed,
      'Collaboration channel has been destroyed.',
    );
  }
}

/** DI value used to distinguish editor-owned channels from host-retained channels. */
export interface CollaborationChannelBinding {
  readonly channel: CollaborationChannel;
  readonly owner: 'editor' | 'host';
}

export const CollaborationChannelBinding = {
  symbol: Symbol.for('CollaborationChannelBinding'),
} as const;
