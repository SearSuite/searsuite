import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';

import {
  type EventObservationDefinition,
  type ObservationDefinition,
  ObservationKind,
  type ObservationSource,
  type StateObservationDefinition,
  type StateObservationSource,
} from './ObservationDefinition';
import { ObservationError, ObservationErrorCode } from './ObservationError';

interface ObservationRegistration {
  readonly identity: ObservationDefinition<unknown>;
  readonly definition: ObservationDefinition<unknown>;
  readonly source: ObservationSource<unknown>;
  readonly subscriptions: Set<() => void>;
}

type ObservationListenerScope = <Value>(callback: () => Value) => Value;

/** Editor-local typed observation registry exposed to plugins and third-party hosts. */
@Injectable()
export class ObservationRegistry {
  readonly #platform: Platform | undefined;

  /** DI token for resolving the registry owned by one editor instance. */
  public static readonly symbol = Symbol.for('ObservationRegistry');

  readonly #registrations = new Map<string, ObservationRegistration>();
  #destroyed = false;
  #assertWrite: (() => void) | null = null;
  #runListener: ObservationListenerScope = (callback) => callback();
  #detachValue: (value: unknown, definition: ObservationDefinition<unknown>) => unknown = (value) => value;

  /** Creates a registry that reports isolated host listener failures through the platform. */
  public constructor(@Inject(Platform.symbol) platform?: Platform) {
    this.#platform = platform;
  }

  /** Requires editor command dispatch for source registration changes after assembly. */
  public enforceWriteBoundary(
    assertWrite: () => void,
    runListener: ObservationListenerScope = (callback) => callback(),
    detachValue: (value: unknown, definition: ObservationDefinition<unknown>) => unknown = (value) => value,
  ): void {
    if (this.#assertWrite) throw new ObservationError(ObservationErrorCode.AlreadyRegistered, 'Observation write boundary is already installed.');
    this.#assertWrite = assertWrite;
    this.#runListener = runListener;
    this.#detachValue = detachValue;
    Object.freeze(this);
  }

  /** Registers an event-only source and returns an idempotent registration disposer. */
  public register<Value>(definition: EventObservationDefinition<Value>, source: ObservationSource<Value>): () => void;
  /** Registers a state source and returns an idempotent registration disposer. */
  public register<Value>(
    definition: StateObservationDefinition<Value>,
    source: StateObservationSource<Value>,
  ): () => void;
  public register<Value>(definition: ObservationDefinition<Value>, source: ObservationSource<Value>): () => void {
    this.#assertLive();
    this.#assertWrite?.();
    this.#assertDefinition(definition);
    const registeredDefinition = Object.freeze({ id: definition.id, kind: definition.kind });
    if (registeredDefinition.kind === ObservationKind.State && !hasSnapshot(source)) {
      throw new ObservationError(
        ObservationErrorCode.SnapshotUnavailable,
        `State observation "${registeredDefinition.id}" requires a getSnapshot() source.`,
        { observationId: registeredDefinition.id },
      );
    }
    if (this.#registrations.has(registeredDefinition.id)) {
      throw new ObservationError(
        ObservationErrorCode.AlreadyRegistered,
        `Observation "${registeredDefinition.id}" is already registered.`,
        { observationId: registeredDefinition.id },
      );
    }
    Object.freeze(definition);

    const registration: ObservationRegistration = {
      identity: definition as ObservationDefinition<unknown>,
      definition: registeredDefinition,
      source: snapshotSource(source) as ObservationSource<unknown>,
      subscriptions: new Set(),
    };
    this.#registrations.set(registeredDefinition.id, registration);
    const registry = this;
    return function unregisterObservation(): void {
      registry.#assertWrite?.();
      if (registry.#registrations.get(registeredDefinition.id) !== registration) return;
      registry.#disposeRegistration(registration);
      registry.#registrations.delete(registeredDefinition.id);
    };
  }

  /** Subscribes to a typed observation and returns an idempotent disposer. */
  public subscribe<Value>(definition: ObservationDefinition<Value>, listener: (value: Value) => void): () => void {
    const registration = this.#resolveRegistration(definition);
    const registeredDefinition = registration.definition;
    const safeListener = (value: Value): void => {
      this.#runListener(() => {
        try {
          listener(this.#detachValue(value, registeredDefinition) as Value);
        } catch (error) {
          this.#platform?.warn?.(`Observation "${registeredDefinition.id}" listener failed.`, error);
        }
      });
    };
    let snapshotDelivered = registeredDefinition.kind !== ObservationKind.State;
    const pendingValues: Value[] = [];
    const sourceDispose = (registration.source as ObservationSource<Value>).subscribe((value) => {
      if (!snapshotDelivered) {
        pendingValues.push(value);
        return;
      }
      safeListener(value);
    });
    let active = true;
    const dispose = (): void => {
      if (!active) return;
      active = false;
      registration.subscriptions.delete(dispose);
      sourceDispose();
    };
    registration.subscriptions.add(dispose);
    try {
      if (registeredDefinition.kind === ObservationKind.State) {
        safeListener((registration.source as StateObservationSource<Value>).getSnapshot());
        for (let index = 0; index < pendingValues.length; index += 1) {
          safeListener(pendingValues[index]);
        }
        snapshotDelivered = true;
      }
    } catch (error) {
      dispose();
      throw error;
    }
    return dispose;
  }

  /** Returns the current snapshot for a state observation without subscribing. */
  public getSnapshot<Value>(definition: StateObservationDefinition<Value>): Value {
    const registration = this.#resolveRegistration(definition);
    if (!hasSnapshot(registration.source)) {
      throw new ObservationError(
        ObservationErrorCode.SnapshotUnavailable,
        `Observation "${definition.id}" has no state snapshot.`,
        { observationId: definition.id },
      );
    }
    return this.#detachValue(registration.source.getSnapshot(), registration.definition) as Value;
  }

  /** Returns whether an observation id is registered in this editor instance. */
  public has(definition: ObservationDefinition<unknown> | string): boolean {
    this.#assertLive();
    return this.#registrations.has(typeof definition === 'string' ? definition : definition.id);
  }

  /** Returns a stable snapshot of registered observation definitions sorted by id. */
  public getRegisteredObservations(): readonly ObservationDefinition<unknown>[] {
    this.#assertLive();
    return [...this.#registrations.values()]
      .map(({ identity }) => identity)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  /** Disposes every active host subscription and removes all registered sources. */
  public destroy(): void {
    if (this.#destroyed) return;
    this.#assertWrite?.();
    this.#destroyed = true;
    this.#registrations.forEach((registration) => this.#disposeRegistration(registration));
    this.#registrations.clear();
  }

  #resolveRegistration<Value>(definition: ObservationDefinition<Value>): ObservationRegistration {
    this.#assertLive();
    const registration = this.#registrations.get(definition.id);
    if (!registration) {
      throw new ObservationError(
        ObservationErrorCode.NotRegistered,
        `Observation "${definition.id}" is not registered.`,
        { observationId: definition.id },
      );
    }
    if (registration.identity !== definition) {
      throw new ObservationError(
        ObservationErrorCode.DefinitionMismatch,
        `Observation "${definition.id}" must use its registered feature-owned definition.`,
        { observationId: definition.id },
      );
    }
    return registration;
  }

  #assertLive(): void {
    if (!this.#destroyed) return;
    throw new ObservationError(ObservationErrorCode.RegistryDestroyed, 'ObservationRegistry has been destroyed.');
  }

  #assertDefinition(definition: ObservationDefinition<unknown>): void {
    if (definition.id.trim().length > 0) return;
    throw new ObservationError(
      ObservationErrorCode.InvalidDefinition,
      'Observation definitions require a non-empty id.',
      { observationId: definition.id },
    );
  }

  #disposeRegistration(registration: ObservationRegistration): void {
    [...registration.subscriptions].forEach((dispose) => dispose());
    registration.subscriptions.clear();
  }
}

function hasSnapshot(source: ObservationSource<unknown>): source is StateObservationSource<unknown> {
  return typeof (source as Partial<StateObservationSource<unknown>>).getSnapshot === 'function';
}

function snapshotSource<Value>(source: ObservationSource<Value>): ObservationSource<Value> {
  return Object.freeze({
    subscribe: source.subscribe.bind(source),
    ...(hasSnapshot(source) ? { getSnapshot: source.getSnapshot.bind(source) } : {}),
  });
}
