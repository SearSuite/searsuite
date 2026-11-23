import { type CollaborationStatus } from './CollaborationStatus';

export interface CollaborationConnectOptions {
  readonly url: string;
  readonly resourceId: string;
  readonly revision?: number;
}

/** Host-facing lifecycle API independent from a concrete editor bridge. */
export interface CollaborationSession {
  connect(options: CollaborationConnectOptions): Promise<void>;
  disconnect(): void;
  getStatus(): CollaborationStatus;
}
