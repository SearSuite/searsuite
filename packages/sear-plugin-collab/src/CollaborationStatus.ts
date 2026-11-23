/** Public lifecycle state of one collaboration session. */
export const CollaborationConnectionState = {
  Disconnected: 'disconnected',
  Connecting: 'connecting',
  Online: 'online',
  Error: 'error',
} as const;

export type CollaborationConnectionState =
  (typeof CollaborationConnectionState)[keyof typeof CollaborationConnectionState];

export interface CollaborationStatus {
  readonly state: CollaborationConnectionState;
  readonly resourceId: string | null;
  readonly revision: number;
  readonly pendingCount: number;
  readonly error: unknown | null;
}
