import { Injectable } from '@searsuite/sear-foundation-di';
import { type CollaborationClientMessage, type CollaborationServerMessage } from '@searsuite/sear-domain-collaboration';
import { CollabTransport } from './CollabTransport';
import { type CollaborationTransportConnectOptions } from './CollabTransport';

/** Collaboration transport that keeps the plugin local to the current host. */
@Injectable()
export class HeadlessCollabTransport extends CollabTransport {
  /** DI token for resolving HeadlessCollabTransport. */
  public static readonly symbol: symbol = Symbol.for('HeadlessCollabTransport');

  /** Opens the collaboration transport and begins receiving messages. */
  public connect(_options: CollaborationTransportConnectOptions): Promise<void> {
    return Promise.resolve();
  }

  /** Closes the collaboration transport and releases its listeners. */
  public disconnect(): void {}
  /** Sends one encoded collaboration message through the transport. */
  public send(_message: CollaborationClientMessage): void {}
  /** Subscribes without producing network messages. */
  public subscribe(_handler: (message: CollaborationServerMessage) => void): () => void {
    return () => void 0;
  }
}
