import { Injectable } from '@searsuite/sear-foundation-di';
import {
  assertSessionStateId,
  assertSessionStateRestorePhase,
  SessionStateRestorePhase,
  type SessionStateAdapter,
  type SessionStateDefinition,
  type SessionStateSnapshot,
} from './SessionState';
import { SessionStateError, SessionStateErrorCode } from './SessionStateError';
import { cloneSessionStateValue } from './cloneSessionStateValue';

interface SessionStateRegistration {
  readonly definition: SessionStateDefinition<unknown>;
  readonly adapter: SessionStateAdapter<unknown>;
}

const orderedRestorePhases: readonly SessionStateRestorePhase[] = [
  SessionStateRestorePhase.BeforeInitialize,
  SessionStateRestorePhase.AfterInitialize,
];

/** Editor-local coordinator for all built-in and plugin-contributed session state. */
@Injectable()
export class SessionStateRegistry {
  /** DI token for resolving the editor-local registry. */
  public static readonly symbol = Symbol.for('SessionStateRegistry');

  readonly #registrations = new Map<string, SessionStateRegistration>();
  readonly #retainedState = new Map<string, unknown>();
  readonly #completedRestorePhases = new Set<SessionStateRestorePhase>();
  #activeRestorePhase: SessionStateRestorePhase | null = null;
  #snapshotLoaded = false;
  #lifecycleToken: object | null = null;

  /** Closes initialization-only restore operations for an assembled editor. */
  public sealRestoration(lifecycleToken: object): void {
    if (this.#lifecycleToken) throw new SessionStateError(
      SessionStateErrorCode.restorePhaseClosed,
      'Session state restoration is already sealed.',
    );
    this.#lifecycleToken = lifecycleToken;
  }

  /** Registers one state owner and returns an idempotent disposer. */
  public register<State>(definition: SessionStateDefinition<State>, adapter: SessionStateAdapter<State>): () => void {
    assertSessionStateId(definition.id);
    assertSessionStateRestorePhase(adapter.restorePhase);
    if (
      this.#completedRestorePhases.has(adapter.restorePhase) ||
      this.#activeRestorePhase === adapter.restorePhase
    ) {
      throw new SessionStateError(
        SessionStateErrorCode.restorePhaseClosed,
        `Session state "${definition.id}" cannot register after restore phase "${adapter.restorePhase}" began.`,
        { sessionStateId: definition.id, restorePhase: adapter.restorePhase },
      );
    }
    if (this.#registrations.has(definition.id)) {
      throw new SessionStateError(
        SessionStateErrorCode.registrationConflict,
        `Session state "${definition.id}" is already registered.`,
        { sessionStateId: definition.id },
      );
    }
    const registeredDefinition = Object.freeze({ id: definition.id });
    const registeredAdapter: SessionStateAdapter<unknown> = Object.freeze({
      restorePhase: adapter.restorePhase,
      ...(adapter.restoreAfter ? { restoreAfter: Object.freeze(adapter.restoreAfter.map((required) =>
        Object.freeze({ id: required.id }))) } : {}),
      capture: adapter.capture.bind(adapter),
      restore: adapter.restore.bind(adapter) as (state: unknown) => void,
    });
    const registration: SessionStateRegistration = Object.freeze({
      definition: registeredDefinition,
      adapter: registeredAdapter,
    });
    this.#registrations.set(registeredDefinition.id, registration);

    let disposed = false;
    return () => {
      if (disposed || this.#lifecycleToken) return;
      disposed = true;
      if (this.#registrations.get(registeredDefinition.id) === registration) {
        this.#registrations.delete(registeredDefinition.id);
      }
    };
  }

  /** Loads a complete snapshot before lifecycle restoration begins. */
  public loadSnapshot(snapshot: SessionStateSnapshot): void {
    this.#assertRestorationOpen();
    this.#retainedState.clear();
    Object.entries(snapshot).forEach(([id, state]) => {
      assertSessionStateId(id);
      this.#retainedState.set(id, cloneSessionStateValue(state));
    });
    this.#completedRestorePhases.clear();
    this.#snapshotLoaded = true;
  }

  /** Restores every registered contributor assigned to one ordered lifecycle phase. */
  public restorePhase(phase: SessionStateRestorePhase): void {
    this.#assertRestorationOpen();
    assertSessionStateRestorePhase(phase);
    if (!this.#snapshotLoaded) {
      throw new SessionStateError(
        SessionStateErrorCode.snapshotNotLoaded,
        'A session state snapshot must be loaded before restore phases run.',
        { restorePhase: phase },
      );
    }
    if (this.#activeRestorePhase !== null) {
      throw new SessionStateError(
        SessionStateErrorCode.restoreInProgress,
        `Session state restore phase "${this.#activeRestorePhase}" is already running.`,
        { restorePhase: phase, activeRestorePhase: this.#activeRestorePhase },
      );
    }
    if (this.#completedRestorePhases.has(phase)) return;
    const phaseIndex = orderedRestorePhases.indexOf(phase);
    const missingEarlierPhase = orderedRestorePhases
      .slice(0, phaseIndex)
      .find((candidate) => !this.#completedRestorePhases.has(candidate));
    if (missingEarlierPhase) {
      throw new SessionStateError(
        SessionStateErrorCode.invalidRestoreOrder,
        `Session state restore phase "${phase}" cannot run before "${missingEarlierPhase}".`,
        { restorePhase: phase, requiredRestorePhase: missingEarlierPhase },
      );
    }
    const registrations = this.#getRestoreOrder(phase);
    this.#activeRestorePhase = phase;
    try {
      registrations.forEach((registration) => this.#restoreRegistration(registration));
      this.#completedRestorePhases.add(phase);
    } finally {
      this.#activeRestorePhase = null;
    }
  }

  /** Captures every registered contributor while preserving state whose owner is not loaded. */
  public capture(): SessionStateSnapshot {
    const snapshot = new Map(
      [...this.#retainedState].map(([id, state]) => [id, cloneSessionStateValue(state)] as const),
    );
    this.#registrations.forEach(({ adapter }, id) => {
      const state = adapter.capture();
      if (state === void 0) snapshot.delete(id);
      else snapshot.set(id, cloneSessionStateValue(state));
    });
    return Object.freeze(
      Object.fromEntries([...snapshot.entries()].sort(([left], [right]) => left.localeCompare(right))),
    );
  }

  /** Returns sorted ids for currently registered contributors. */
  public getRegisteredStateIds(): readonly string[] {
    return [...this.#registrations.keys()].sort();
  }

  /** Returns restore phases already completed by this editor lifecycle. */
  public getCompletedRestorePhases(): readonly SessionStateRestorePhase[] {
    return orderedRestorePhases.filter((phase) => this.#completedRestorePhases.has(phase));
  }

  /** Rejects a retained contributor restore callback after editor initialization. */
  public assertRestorationOpen(): void {
    this.#assertRestorationOpen();
  }

  /** Clears contributors and retained state owned by this registry instance. */
  public clear(lifecycleToken?: object): void {
    if (this.#lifecycleToken && lifecycleToken !== this.#lifecycleToken) {
      throw new SessionStateError(SessionStateErrorCode.restorePhaseClosed, 'Session state cleanup requires its owner.');
    }
    this.#registrations.clear();
    this.#retainedState.clear();
    this.#completedRestorePhases.clear();
    this.#activeRestorePhase = null;
    this.#snapshotLoaded = false;
  }

  #assertRestorationOpen(): void {
    if (this.#lifecycleToken) throw new SessionStateError(
      SessionStateErrorCode.restorePhaseClosed,
      'Session state restoration is closed for this editor.',
    );
  }

  #restoreRegistration(registration: SessionStateRegistration): void {
    const { definition, adapter } = registration;
    if (this.#snapshotLoaded && this.#retainedState.has(definition.id)) {
      adapter.restore(cloneSessionStateValue(this.#retainedState.get(definition.id)));
    }
  }

  #getRestoreOrder(phase: SessionStateRestorePhase): SessionStateRegistration[] {
    const registrations = [...this.#registrations.values()]
      .filter((registration) => registration.adapter.restorePhase === phase)
      .sort((left, right) => left.definition.id.localeCompare(right.definition.id));
    const registrationsById = new Map(
      registrations.map((registration) => [registration.definition.id, registration] as const),
    );
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: SessionStateRegistration[] = [];

    const visit = (registration: SessionStateRegistration): void => {
      const id = registration.definition.id;
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new SessionStateError(
          SessionStateErrorCode.restoreDependencyCycle,
          `Session state restore dependencies contain a cycle at "${id}".`,
          { sessionStateId: id, restorePhase: phase },
        );
      }
      visiting.add(id);
      registration.adapter.restoreAfter?.forEach((dependency) => {
        const registeredDependency = this.#registrations.get(dependency.id);
        if (!registeredDependency) return;
        const dependencyPhaseIndex = orderedRestorePhases.indexOf(registeredDependency.adapter.restorePhase);
        const phaseIndex = orderedRestorePhases.indexOf(phase);
        if (dependencyPhaseIndex > phaseIndex) {
          throw new SessionStateError(
            SessionStateErrorCode.invalidRestoreDependency,
            `Session state "${id}" cannot restore after later-phase state "${dependency.id}".`,
            { sessionStateId: id, dependencySessionStateId: dependency.id, restorePhase: phase },
          );
        }
        const samePhaseDependency = registrationsById.get(dependency.id);
        if (samePhaseDependency) visit(samePhaseDependency);
      });
      visiting.delete(id);
      visited.add(id);
      ordered.push(registration);
    };

    registrations.forEach(visit);
    return ordered;
  }
}
