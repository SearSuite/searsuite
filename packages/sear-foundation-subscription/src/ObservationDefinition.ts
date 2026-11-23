/** Distinguishes snapshot-backed state observations from event-only streams. */
export const ObservationKind = {
  /** Stream with no current snapshot; subscribers receive only future events. */
  Event: 'event',
  /** Stream with a readable current snapshot plus future changes. */
  State: 'state',
} as const;

/** Supported observation delivery models. */
export type ObservationKind = (typeof ObservationKind)[keyof typeof ObservationKind];

/** Typed identity imported by publishers and consumers of one observation. */
export interface ObservationDefinition<Value> {
  /** Stable globally unique id used for registration diagnostics. */
  readonly id: string;
  /** Delivery model that determines whether a current snapshot is available. */
  readonly kind: ObservationKind;
  /** Compile-time value carrier; never populated at runtime. */
  readonly valueType?: Value;
}

/** Definition for an event-only observation stream. */
export interface EventObservationDefinition<Value> extends ObservationDefinition<Value> {
  /** Event observations have no current snapshot. */
  readonly kind: typeof ObservationKind.Event;
}

/** Definition for an observation stream backed by a current state snapshot. */
export interface StateObservationDefinition<Value> extends ObservationDefinition<Value> {
  /** State observations expose a current snapshot. */
  readonly kind: typeof ObservationKind.State;
}

/** Creates a typed identity for an event-only observation stream. */
export function defineEventObservation<Value>(id: string): EventObservationDefinition<Value> {
  return Object.freeze({ id, kind: ObservationKind.Event });
}

/** Creates a typed identity for a snapshot-backed state observation stream. */
export function defineStateObservation<Value>(id: string): StateObservationDefinition<Value> {
  return Object.freeze({ id, kind: ObservationKind.State });
}

/** Produces future values for an event or state observation. */
export interface ObservationSource<Value> {
  /** Registers a listener for future values and returns an idempotent disposer. */
  subscribe(listener: (value: Value) => void): () => void;
}

/** Produces a current snapshot plus future values for a state observation. */
export interface StateObservationSource<Value> extends ObservationSource<Value> {
  /** Returns the current immutable state snapshot. */
  getSnapshot(): Value;
}
