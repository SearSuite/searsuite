import { type CollaborationClientMessage, type CollaborationServerMessage } from '@searsuite/sear-domain-collaboration';

/** Connection parameters for one collaboration resource. */
export interface CollaborationTransportConnectOptions {
  readonly url: string;
  readonly resourceId: string;
  readonly revision: number;
}

/**
 * Abstract transport layer.  Swap implementations (WebSocket, BroadcastChannel,
 * polling, etc.) without touching the plugin logic.
 */
export abstract class CollabTransport {
  /** DI token for resolving CollabTransport. */
  public static readonly symbol: symbol = Symbol.for('CollabTransport');

  /** Opens the collaboration transport and begins receiving messages. */
  abstract connect(options: CollaborationTransportConnectOptions): Promise<void>;
  /** Closes the collaboration transport and releases its listeners. */
  abstract disconnect(): void;
  /** Sends one encoded collaboration message through the transport. */
  abstract send(message: CollaborationClientMessage): void;
  /** Subscribes to server messages and returns an idempotent disposer. */
  abstract subscribe(handler: (message: CollaborationServerMessage) => void): () => void;
}
