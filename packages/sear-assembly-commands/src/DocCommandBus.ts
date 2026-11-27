import { SearError } from '@searsuite/sear-foundation-error';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { CommandExecutionPhase } from '@searsuite/sear-foundation-common';
import {
  getCommandObserverEpoch,
  isInsideCommandExecution,
  runInsideCommandExecution,
  runOutsideCommandExecution,
  warnIfSyntheticCommandDefinition,
} from '@searsuite/sear-assembly-plugin';

import {
  type DocCommandContext,
  type DocCommandEvent,
  type DocCommandFactory,
  type DocCommandListener,
  type DocCommandRegistration,
  type DocCommandResult,
  type DocEditorCommand,
} from './DocEditorCommandTypes';
import {
  type DocCommandDefinition,
  type DocCommandDefinitionResult,
  type DocCommandInput,
} from './DocCommandDefinition';
import { DocCommandDispatcher } from './DocCommandDispatcher';

/**
 * Per-editor entry point for typed document commands.
 *
 * Features register a definition and a factory during editor setup. A host or
 * input handler calls `run` with that definition and typed input; the bus
 * creates the command, dispatches it, and emits started, completed, or failed
 * events. The bus must be bound to an editor context before commands can run.
 */
@Injectable()
export class DocCommandBus {
  readonly #platform: Platform | undefined;

  /** DI token for resolving the command bus bound to one document editor instance. */
  public static readonly symbol = Symbol.for('DocCommandBus');

  #context: DocCommandContext | undefined;
  #destroyed = false;
  #executionDepth = 0;
  #activeObserverEpoch = 0;
  readonly #dispatcher = new DocCommandDispatcher();
  readonly #listeners = new Set<DocCommandListener>();
  readonly #registrations = new Map<string, DocCommandRegistration>();
  #assertRegistrationWrite: (() => void) | null = null;

  /** Creates a command bus that reports boundary diagnostics through the host platform. */
  constructor(@Inject(Platform.symbol) platform?: Platform) {
    this.#platform = platform;
    Object.defineProperty(this, 'isExecuting', {
      value: (): boolean =>
        this.#executionDepth > 0 &&
        isInsideCommandExecution() &&
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

  /** Binds the command bus to the runtime services for one editor instance. */
  bind(context: DocCommandContext): void {
    this.#assertLive();
    if (this.#context) throw new SearError('DocCommandBus is already bound to an editor.');
    this.#context = context;
  }

  /** Closes setup-time command registration after the editor is assembled. */
  enforceRegistrationBoundary(assertWrite: () => void): void {
    if (this.#assertRegistrationWrite) throw new SearError('Doc command registration boundary is already installed.');
    this.#assertRegistrationWrite = assertWrite;
    Object.preventExtensions(this);
  }

  #executeCommand<Result extends DocCommandResult>(id: string, createCommand: () => DocEditorCommand<Result>): Result {
    const context = this.#context;
    if (!context) throw new SearError(`DocCommandBus cannot run ${id} before it is bound to an editor.`);
    const boundContext = context;
    const commandBus = this;
    function executeDocCommandDispatch(): Result {
      const previousObserverEpoch = commandBus.#activeObserverEpoch;
      commandBus.#activeObserverEpoch = getCommandObserverEpoch();
      commandBus.#executionDepth += 1;
      try {
        commandBus.#notify({ phase: CommandExecutionPhase.Started, id });
        const command = createCommand();
        if (command.id !== id) {
          throw new SearError(`DocCommandBus factory for ${id} created a command with mismatched id ${command.id}.`);
        }
        const result = commandBus.#dispatcher.execute(boundContext, command);
        commandBus.#notify({ phase: CommandExecutionPhase.Completed, id, result });
        return result;
      } catch (error) {
        commandBus.#notify({ phase: CommandExecutionPhase.Failed, id, error });
        throw error;
      } finally {
        commandBus.#executionDepth -= 1;
        commandBus.#activeObserverEpoch = previousObserverEpoch;
      }
    }
    return runInsideCommandExecution(id, executeDocCommandDispatch);
  }

  /** Whether this editor's command bus is currently dispatching a command. */
  public isExecuting(): boolean {
    return (
      this.#executionDepth > 0 && isInsideCommandExecution() && this.#activeObserverEpoch === getCommandObserverEpoch()
    );
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

  /**
   * Creates and executes the command registered for a typed definition.
   * @returns The result returned by the command after its pipeline and effects run.
   * @throws SearError if the definition is unregistered, the bus is unbound, or
   * the factory creates a command with a different id. Command failures propagate.
   */
  run<Definition extends DocCommandDefinition<unknown, DocCommandResult>>(
    definition: Definition,
    input: DocCommandInput<Definition>,
  ): DocCommandDefinitionResult<Definition> {
    this.#assertLive();
    const { id } = definition;
    const registration = this.#registrations.get(id);
    if (!registration) throw new SearError(`DocCommandBus has no command registered for ${id}.`);
    if (registration.definition !== definition) warnIfSyntheticCommandDefinition('DocCommandBus', id, this.#warn);
    return this.#executeCommand(id, () => registration.factory(input)) as DocCommandDefinitionResult<Definition>;
  }

  /**
   * Registers one feature-owned command factory. The returned function must be
   * called by lifecycle cleanup when a feature registers dynamically.
   */
  register<Definition extends DocCommandDefinition<unknown, DocCommandResult>>(
    definition: Definition,
    factory: DocCommandFactory<Definition>,
  ): () => void {
    this.#assertLive();
    this.#assertRegistrationWrite?.();
    const { id } = definition;
    if (this.#registrations.has(id)) throw new SearError(`DocCommandBus already has a command registered for ${id}.`);
    Object.freeze(definition);
    const registration: DocCommandRegistration = {
      definition,
      factory: factory as (input: unknown) => DocEditorCommand<DocCommandResult>,
    };
    this.#registrations.set(id, registration);
    const bus = this;
    let disposed = false;
    return function unregisterDocCommand(): void {
      if (disposed || bus.#destroyed || bus.#registrations.get(id) !== registration) return;
      bus.#assertRegistrationWrite?.();
      disposed = true;
      bus.#registrations.delete(id);
    };
  }

  /** Subscribes to document command lifecycle events and returns an unsubscribe function. */
  subscribe(listener: DocCommandListener): () => void {
    this.#assertLive();
    this.#listeners.add(listener);
    const bus = this;
    return function unsubscribeDocCommandListener(): void {
      bus.#listeners.delete(listener);
    };
  }

  /** Returns whether this editor instance currently exposes a document command id. */
  has(definition: DocCommandDefinition<unknown, DocCommandResult> | string): boolean {
    this.#assertLive();
    return this.#registrations.has(typeof definition === 'string' ? definition : definition.id);
  }

  /** Returns the typed definitions registered on this editor instance. */
  getRegisteredCommands(): readonly DocCommandDefinition<unknown, DocCommandResult>[] {
    this.#assertLive();
    return [...this.#registrations.values()]
      .map(({ definition }) => definition)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  /** Returns a stable snapshot of all document commands exposed by this editor instance. */
  getRegisteredCommandIds(): readonly string[] {
    return this.getRegisteredCommands().map(({ id }) => id);
  }

  /** Clears editor binding, listeners, and command registrations during teardown. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#assertRegistrationWrite?.();
    this.#destroyed = true;
    this.#context = void 0;
    this.#listeners.clear();
    this.#registrations.clear();
  }

  #notify(event: DocCommandEvent): void {
    this.runWithoutMutationAuthority(() => {
      [...this.#listeners].forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          this.#warn(`DocCommandBus listener failed during ${event.phase}:${event.id}.`, error);
        }
      });
    });
  }

  #warn = (message: string, ...details: unknown[]): void => {
    this.#platform?.warn?.(message, ...details);
  };

  #assertLive(): void {
    if (this.#destroyed) throw new SearError('DocCommandBus has been destroyed.');
  }
}
