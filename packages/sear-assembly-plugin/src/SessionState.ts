import { SessionStateError, SessionStateErrorCode } from './SessionStateError';

/** Ordered lifecycle phases in which local state may be restored. */
export const SessionStateRestorePhase = {
  BeforeInitialize: 'beforeInitialize',
  AfterInitialize: 'afterInitialize',
} as const;

/** A supported local-state restoration phase. */
export type SessionStateRestorePhase =
  (typeof SessionStateRestorePhase)[keyof typeof SessionStateRestorePhase];

/** Typed identity owned and exported by one local-state contributor. */
export interface SessionStateDefinition<State> {
  /** Stable, globally unique id used in the in-memory session snapshot. */
  readonly id: string;
  /** Compile-time state carrier; never populated at runtime. */
  readonly stateType?: State;
}

/** Creates an immutable typed identity for one local session value. */
export function defineSessionState<State>(id: string): SessionStateDefinition<State> {
  assertSessionStateId(id);
  return Object.freeze({ id });
}

/** Reads one contributor value from an opaque snapshot through its typed definition. */
export function readSessionState<State>(
  snapshot: SessionStateSnapshot,
  definition: SessionStateDefinition<State>,
): State | undefined {
  return snapshot[definition.id] as State | undefined;
}

/** Captures and restores one detached local session value. */
export interface SessionStateAdapter<State> {
  /** Lifecycle phase in which restore() may safely update the owning feature. */
  readonly restorePhase: SessionStateRestorePhase;
  /** Contributors in the same phase that must restore before this one when they are registered. */
  readonly restoreAfter?: readonly SessionStateDefinition<unknown>[];
  /** Returns plain data or a supported built-in value; custom class instances are not session snapshots. */
  capture(): State | undefined;
  /** Restores local state during the declared lifecycle phase. */
  restore(state: State): void;
}

/** Opaque in-memory snapshot keyed by contributor-owned definition ids. */
export type SessionStateSnapshot = Readonly<Record<string, unknown>>;

/** @internal Validates ids supplied through either the factory or structural definitions. */
export function assertSessionStateId(id: string): void {
  if (id.trim().length > 0) return;
  throw new SessionStateError(
    SessionStateErrorCode.invalidDefinition,
    'Session state definitions require a non-empty id.',
    { sessionStateId: id },
  );
}

/** @internal Validates structurally supplied adapter phases. */
export function assertSessionStateRestorePhase(phase: SessionStateRestorePhase): void {
  if (Object.values(SessionStateRestorePhase).includes(phase)) return;
  throw new SessionStateError(
    SessionStateErrorCode.invalidRestorePhase,
    `Unsupported session state restore phase "${String(phase)}".`,
    { restorePhase: phase },
  );
}
