import { Pipeline } from '@searsuite/sear-assembly-core';
import { CommandExecutionPhase } from '@searsuite/sear-foundation-common';

import {
  type DocCommandDefinition,
  type DocCommandDefinitionResult,
  type DocCommandInput,
} from './DocCommandDefinition';

/**
 * The active document editor's execution boundary for a command result.
 *
 * A document command prepares a pipeline and optional local effects. The
 * dispatcher passes the pipeline here first, then applies effects after it
 * returns. Implementations commit document state before rendering it.
 */
export interface DocCommandContext {
  /**
   * Executes command-owned work through the document core's shared pipeline
   * boundary. Implementations commit document state before rendering.
   */
  executePipeline(pipeline: Pipeline): void;
  /** Applies a local UI/runtime effect after the operation has been committed. */
  applyEffect(effect: DocCommandEffect): void;
}

/** Local runtime effects that document commands can request outside document state. */
export type DocCommandEffect =
  | {
      /** Moves keyboard focus to the document input adapter. */
      readonly type: 'focus-document';
    }
  | {
      /** Restarts caret blinking after an editing or selection operation. */
      readonly type: 'reset-caret-blink';
    };

/**
 * Work produced by a document command for the editor to apply.
 *
 * The pipeline carries document mutation and rendering work. Optional effects
 * are local actions, such as moving focus or restarting the caret blink, and
 * do not become document state.
 */
export interface DocCommandResult {
  /** Command-owned pipeline containing mutation, render and local-action steps. */
  readonly pipeline: Pipeline;
  /** Optional local effects requested after operation execution. */
  readonly effects?: readonly DocCommandEffect[];
}

/** Executable unit behind a typed document command definition. */
export interface DocEditorCommand<Result extends DocCommandResult = DocCommandResult> {
  /** Stable, domain-owned command identifier for observability and automation. */
  readonly id: string;
  /** Runs command logic and returns a pipeline-backed result. */
  execute(context: DocCommandContext): Result;
}

/** Factory installed by a document feature plugin to create a command from typed input. */
export type DocCommandFactory<Definition extends DocCommandDefinition<unknown, DocCommandResult>> = (
  input: DocCommandInput<Definition>,
) => DocEditorCommand<DocCommandDefinitionResult<Definition>>;

/** Observer invoked when document command execution starts, completes, or fails. */
export type DocCommandListener = (event: DocCommandEvent) => void;

/** Lifecycle event emitted by the document command bus for diagnostics and host UI. */
export interface DocCommandEvent {
  /** Execution phase represented by this event. */
  readonly phase: CommandExecutionPhase;
  /** Stable command id being executed. */
  readonly id: string;
  /** Result returned by a completed command. */
  readonly result?: DocCommandResult;
  /** Original thrown value when the command failed. */
  readonly error?: unknown;
}

export interface DocCommandRegistration {
  readonly definition: DocCommandDefinition<unknown, DocCommandResult>;
  readonly factory: (input: unknown) => DocEditorCommand<DocCommandResult>;
}
