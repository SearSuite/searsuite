import { SearError } from '@searsuite/sear-foundation-error';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { CommandExecutionPhase } from '@searsuite/sear-foundation-common';
import { getCommandObserverEpoch, isInsideCommandExecution, runInsideCommandExecution, runOutsideCommandExecution, warnIfSyntheticCommandDefinition } from '@searsuite/sear-assembly-core';
import {
  type SheetCommand,
  SheetCommandDispatcher,
  type SheetCommandContext,
  type SheetCommandResult,
} from './SheetCommand';
import {
  type SheetCommandDefinition,
  type SheetCommandDefinitionResult,
  type SheetCommandInput,
} from './SheetCommandDefinition';

/** Factory installed by a feature plugin to create a command from typed input. */
export type SheetCommandFactory<Definition extends SheetCommandDefinition<unknown, SheetCommandResult>> = (
  input: SheetCommandInput<Definition>,
) => SheetCommand<SheetCommandDefinitionResult<Definition>>;

/** Observer invoked when command execution starts, completes or fails. */
export type SheetCommandListener = (event: SheetCommandEvent) => void;

/** Lifecycle event emitted by the command bus for diagnostics and host UI. */
export interface SheetCommandEvent {
  /** Execution phase represented by this event. */
  readonly phase: CommandExecutionPhase;
  /** Stable command id being executed. */
  readonly id: string;
  /** Original thrown value when the command failed. */
  readonly error?: unknown;
  /** Successfully executed command result, present only for the completed phase. */
  readonly result?: SheetCommandResult;
}

interface SheetCommandRegistration {
  readonly definition: SheetCommandDefinition<unknown, SheetCommandResult>;
  readonly factory: (input: unknown) => SheetCommand<SheetCommandResult>;
}

/**
 * The only supported execution entry point for sheet user and program actions.
 * Hosts bind it to one editor instance after the Core has been created.
 */
@Injectable()
export class SheetCommandBus {
  readonly #platform: Platform | undefined;

  /** DI token for resolving the command bus bound to one editor instance. */
  public static readonly symbol = Symbol.for('SheetCommandBus');

  #context: SheetCommandContext | undefined;
  #destroyed = false;
  #executionDepth = 0;
  #activeObserverEpoch = 0;
  readonly #dispatcher = new SheetCommandDispatcher();
  readonly #listeners = new Set<SheetCommandListener>();
  readonly #registrations = new Map<string, SheetCommandRegistration>();
  #assertRegistrationWrite: (() => void) | null = null;

  /** Creates a command bus that reports boundary diagnostics through the host platform. */
  constructor(@Inject(Platform.symbol) platform?: Platform) {
    this.#platform = platform;
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

  /** Binds the command bus to the runtime services for one editor instance. */
  bind(context: SheetCommandContext): void {
    this.#assertLive();
    if (this.#context) throw new SearError('SheetCommandBus is already bound to an editor.');
    this.#context = context;
  }

  /** Closes setup-time command registration after the editor is assembled. */
  enforceRegistrationBoundary(assertWrite: () => void): void {
    if (this.#assertRegistrationWrite) throw new SearError('Sheet command registration boundary is already installed.');
    this.#assertRegistrationWrite = assertWrite;
    Object.preventExtensions(this);
  }

  #executeCommand<Result extends SheetCommandResult>(
    id: string,
    createCommand: () => SheetCommand<Result>,
  ): Result {
    const context = this.#context;
    if (!context) throw new SearError(`SheetCommandBus cannot run ${id} before it is bound to an editor.`);
    const boundContext = context;
    const commandBus = this;
    function executeSheetCommandDispatch(): Result {
      const previousObserverEpoch = commandBus.#activeObserverEpoch;
      commandBus.#activeObserverEpoch = getCommandObserverEpoch();
      commandBus.#executionDepth += 1;
      try {
        commandBus.#notify({ phase: CommandExecutionPhase.Started, id });
        const command = createCommand();
        if (command.id !== id) {
          throw new SearError(`SheetCommandBus factory for ${id} created a command with mismatched id ${command.id}.`);
        }
        const result = commandBus.#dispatcher.execute(boundContext, command);
        if (result.completion) {
          void result.completion.then(
            () => commandBus.#notify({ phase: CommandExecutionPhase.Completed, id, result }),
            (error) => commandBus.#notify({ phase: CommandExecutionPhase.Failed, id, error }),
          );
        } else {
          commandBus.#notify({ phase: CommandExecutionPhase.Completed, id, result });
        }
        return result;
      } catch (error) {
        commandBus.#notify({ phase: CommandExecutionPhase.Failed, id, error });
        throw error;
      } finally {
        commandBus.#executionDepth -= 1;
        commandBus.#activeObserverEpoch = previousObserverEpoch;
      }
    }
    return runInsideCommandExecution(id, executeSheetCommandDispatch);
  }

  /** Whether this editor's command bus is currently dispatching a command. */
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

  /** Executes a registered command through its feature-owned typed definition. */
  run<Definition extends SheetCommandDefinition<unknown, SheetCommandResult>>(
    definition: Definition,
    input: SheetCommandInput<Definition>,
  ): SheetCommandDefinitionResult<Definition> {
    this.#assertLive();
    const { id } = definition;
    const registration = this.#registrations.get(id);
    if (!registration) throw new SearError(`SheetCommandBus has no command registered for ${id}.`);
    if (registration.definition !== definition) warnIfSyntheticCommandDefinition('SheetCommandBus', id, this.#warn);
    return this.#executeCommand(id, () => registration.factory(input)) as SheetCommandDefinitionResult<Definition>;
  }

  /**
   * Registers one feature-owned command factory. The returned function must be
   * called by the feature's lifecycle cleanup when it registers dynamically.
   */
  register<Definition extends SheetCommandDefinition<unknown, SheetCommandResult>>(
    definition: Definition,
    factory: SheetCommandFactory<Definition>,
  ): () => void {
    this.#assertLive();
    this.#assertRegistrationWrite?.();
    const { id } = definition;
    if (this.#registrations.has(id)) throw new SearError(`SheetCommandBus already has a command registered for ${id}.`);
    Object.freeze(definition);
    const registration: SheetCommandRegistration = {
      definition,
      factory: factory as (input: unknown) => SheetCommand<SheetCommandResult>,
    };
    this.#registrations.set(id, registration);
    const bus = this;
    let disposed = false;
    return function unregisterSheetCommand(): void {
      if (disposed || bus.#destroyed || bus.#registrations.get(id) !== registration) return;
      bus.#assertRegistrationWrite?.();
      disposed = true;
      bus.#registrations.delete(id);
    };
  }

  /** Subscribes to command lifecycle events and returns an unsubscribe function. */
  subscribe(listener: SheetCommandListener): () => void {
    this.#assertLive();
    this.#listeners.add(listener);
    const bus = this;
    return function unsubscribeSheetCommandListener(): void {
      bus.#listeners.delete(listener);
    };
  }

  /** Returns whether this editor instance currently exposes a command id. */
  has(definition: SheetCommandDefinition<unknown, SheetCommandResult> | string): boolean {
    this.#assertLive();
    return this.#registrations.has(typeof definition === 'string' ? definition : definition.id);
  }

  /** Returns the typed definitions registered on this editor instance. */
  getRegisteredCommands(): readonly SheetCommandDefinition<unknown, SheetCommandResult>[] {
    this.#assertLive();
    return [...this.#registrations.values()]
      .map(({ definition }) => definition)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  /** Returns a stable snapshot of all commands exposed by this editor instance. */
  getRegisteredCommandIds(): readonly string[] {
    return this.getRegisteredCommands().map(({ id }) => id);
  }

  /** Clears editor binding, listeners and command registrations during teardown. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#assertRegistrationWrite?.();
    this.#destroyed = true;
    this.#context = void 0;
    this.#listeners.clear();
    this.#registrations.clear();
  }

  #notify(event: SheetCommandEvent): void {
    this.runWithoutMutationAuthority(() => {
      [...this.#listeners].forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          this.#warn(`SheetCommandBus listener failed during ${event.phase}:${event.id}.`, error);
        }
      });
    });
  }

  #warn = (message: string, ...details: unknown[]): void => {
    this.#platform?.warn?.(message, ...details);
  };

  #assertLive(): void {
    if (this.#destroyed) throw new SearError('SheetCommandBus has been destroyed.');
  }
}
