import { SearError } from '@searsuite/sear-foundation-error';
import {
  type WorkbookCommandDefinition,
  type WorkbookCommandDefinitionResult,
  type WorkbookCommandInput,
} from './WorkbookCommandDefinition';
import { CommandExecutionPhase } from '@searsuite/sear-foundation-common';
import { getCommandObserverEpoch, isInsideCommandExecution, runInsideCommandExecution, runOutsideCommandExecution } from '@searsuite/sear-assembly-core';

/** Observer invoked when workbook command execution starts, completes or fails. */
export type WorkbookCommandListener = (event: WorkbookCommandEvent) => void;

/** Lifecycle event emitted by the workbook command bus for diagnostics and host UI. */
export interface WorkbookCommandEvent {
  /** Execution phase represented by this event. */
  readonly phase: CommandExecutionPhase;
  /** Stable command id being executed. */
  readonly id: string;
  /** Original thrown value when the command failed. */
  readonly error?: unknown;
}

/** Factory installed by the workbook assembly to run one typed command. */
export type WorkbookCommandHandler<Definition extends WorkbookCommandDefinition<unknown, unknown>> = (
  input: WorkbookCommandInput<Definition>,
) => WorkbookCommandDefinitionResult<Definition>;

interface WorkbookCommandRegistration {
  readonly definition: WorkbookCommandDefinition<unknown, unknown>;
  readonly handler: (input: unknown) => unknown;
}

/** Optional diagnostics hooks used by the workbook command bus. */
export interface WorkbookCommandBusOptions {
  /** Receives non-fatal command-boundary diagnostics. */
  readonly warn?: (message: string, ...details: unknown[]) => void;
}

/** Editor-scoped command bus for workbook-level sheet-list actions. */
export class WorkbookCommandBus {
  /** DI token for the command bus owned by one WorkbookEditor. */
  public static readonly symbol = Symbol.for('WorkbookCommandBus');

  #destroyed = false;
  #executionDepth = 0;
  #activeObserverEpoch = 0;
  readonly #listeners = new Set<WorkbookCommandListener>();
  readonly #registrations = new Map<string, WorkbookCommandRegistration>();
  #assertRegistrationWrite: (() => void) | null = null;

  /** Creates an empty workbook command bus. */
  public constructor(private readonly options: WorkbookCommandBusOptions = {}) {
    Object.defineProperty(this, 'isExecuting', {
      value: (): boolean => this.#executionDepth > 0 && isInsideCommandExecution() &&
        this.#activeObserverEpoch === getCommandObserverEpoch(),
      configurable: false,
      writable: false,
    });
    Object.defineProperty(this, 'runWithoutMutationAuthority', {
      value: <Value>(callback: () => Value): Value => {
        const previousDepth = this.#executionDepth;
        this.#executionDepth = 0;
        try {
          return runOutsideCommandExecution(callback);
        } finally {
          this.#executionDepth = previousDepth;
        }
      },
      configurable: false,
      writable: false,
    });
  }

  /** Closes setup-time command registration after the editor is assembled. */
  public enforceRegistrationBoundary(assertWrite: () => void): void {
    if (this.#assertRegistrationWrite) throw new SearError('Workbook command registration boundary is already installed.');
    this.#assertRegistrationWrite = assertWrite;
    Object.preventExtensions(this);
  }

  /**
   * Registers one workbook command handler. The returned disposer removes the
   * handler and is primarily useful for extension commands.
   */
  public register<Definition extends WorkbookCommandDefinition<unknown, unknown>>(
    definition: Definition,
    handler: WorkbookCommandHandler<Definition>,
  ): () => void {
    this.#assertLive();
    this.#assertRegistrationWrite?.();
    const { id } = definition;
    if (this.#registrations.has(id))
      throw new SearError(`WorkbookCommandBus already has a command registered for ${id}.`);
    Object.freeze(definition);
    const registration: WorkbookCommandRegistration = {
      definition,
      handler: handler as (input: unknown) => unknown,
    };
    this.#registrations.set(id, registration);
    const bus = this;
    let disposed = false;
    return function unregisterWorkbookCommand(): void {
      if (disposed || bus.#destroyed || bus.#registrations.get(id) !== registration) return;
      bus.#assertRegistrationWrite?.();
      disposed = true;
      bus.#registrations.delete(id);
    };
  }

  /** Executes a registered workbook command through its typed definition. */
  public run<Definition extends WorkbookCommandDefinition<unknown, unknown>>(
    definition: Definition,
    input: WorkbookCommandInput<Definition>,
  ): WorkbookCommandDefinitionResult<Definition> {
    this.#assertLive();
    const { id } = definition;
    const registration = this.#registrations.get(id);
    if (!registration) throw new SearError(`WorkbookCommandBus has no command registered for ${id}.`);
    if (registration.definition !== definition) {
      this.options.warn?.(`WorkbookCommandBus received a recreated command definition for ${id}.`, {
        registered: registration.definition,
        received: definition,
      });
    }
    return runInsideCommandExecution(id, () => {
      const previousObserverEpoch = this.#activeObserverEpoch;
      this.#activeObserverEpoch = getCommandObserverEpoch();
      this.#executionDepth += 1;
      try {
        this.#notify({ phase: CommandExecutionPhase.Started, id });
        const result = registration.handler(input) as WorkbookCommandDefinitionResult<Definition>;
        if (result && typeof (result as unknown as PromiseLike<unknown>).then === 'function') {
          return Promise.resolve(result).then(
            (value) => {
              this.#notify({ phase: CommandExecutionPhase.Completed, id });
              return value;
            },
            (error) => {
              this.#notify({ phase: CommandExecutionPhase.Failed, id, error });
              throw error;
            },
          ) as WorkbookCommandDefinitionResult<Definition>;
        }
        this.#notify({ phase: CommandExecutionPhase.Completed, id });
        return result;
      } catch (error) {
        this.#notify({ phase: CommandExecutionPhase.Failed, id, error });
        throw error;
      } finally {
        this.#executionDepth -= 1;
        this.#activeObserverEpoch = previousObserverEpoch;
      }
    });
  }

  /** Whether this WorkbookEditor is currently dispatching a command. */
  public isExecuting(): boolean {
    return this.#executionDepth > 0 && isInsideCommandExecution() &&
      this.#activeObserverEpoch === getCommandObserverEpoch();
  }

  /** Invokes external observers without inheriting this editor's command write authority. */
  public runWithoutMutationAuthority<Value>(callback: () => Value): Value {
    const previousDepth = this.#executionDepth;
    this.#executionDepth = 0;
    try {
      return runOutsideCommandExecution(callback);
    } finally {
      this.#executionDepth = previousDepth;
    }
  }

  /** Subscribes to command lifecycle events and returns an unsubscribe function. */
  public subscribe(listener: WorkbookCommandListener): () => void {
    this.#assertLive();
    this.#listeners.add(listener);
    const bus = this;
    return function unsubscribeWorkbookCommandListener(): void {
      bus.#listeners.delete(listener);
    };
  }

  /** Returns whether this workbook editor currently exposes a command id. */
  public has(definition: WorkbookCommandDefinition<unknown, unknown> | string): boolean {
    this.#assertLive();
    return this.#registrations.has(typeof definition === 'string' ? definition : definition.id);
  }

  /** Returns the typed definitions registered on this workbook editor instance. */
  public getRegisteredCommands(): readonly WorkbookCommandDefinition<unknown, unknown>[] {
    this.#assertLive();
    return [...this.#registrations.values()]
      .map(({ definition }) => definition)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  /** Returns a stable snapshot of all workbook command ids exposed by this editor. */
  public getRegisteredCommandIds(): readonly string[] {
    return this.getRegisteredCommands().map(({ id }) => id);
  }

  /** Clears listeners and command registrations during teardown. */
  public destroy(): void {
    if (this.#destroyed) return;
    this.#assertRegistrationWrite?.();
    this.#destroyed = true;
    this.#listeners.clear();
    this.#registrations.clear();
  }

  #notify(event: WorkbookCommandEvent): void {
    this.runWithoutMutationAuthority(() => {
      [...this.#listeners].forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          this.options.warn?.(`WorkbookCommandBus listener failed during ${event.phase}:${event.id}.`, error);
        }
      });
    });
  }

  #assertLive(): void {
    if (this.#destroyed) throw new SearError('WorkbookCommandBus has been destroyed.');
  }
}
