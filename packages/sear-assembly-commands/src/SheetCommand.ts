import { SearError } from '@searsuite/sear-foundation-error';
import { type Pipeline } from '@searsuite/sear-assembly-plugin';

/**
 * The active Sheet editor's execution boundary for a command result.
 *
 * A command produces a pipeline and optional local effects. The dispatcher
 * passes them to this context after the command has returned.
 */
export interface SheetCommandContext {
  /** Applies the command-produced pipeline through the owning kernel transaction boundary. */
  executePipeline(pipeline: Pipeline): void;
  /** Applies a local UI/runtime effect after pipeline execution. */
  applyEffect(effect: SheetCommandEffect): void;
}

/**
 * Executable unit created from a feature-owned typed command definition.
 *
 * Its `execute` method prepares a result; the dispatcher applies that result
 * through the editor context. The command does not commit state itself.
 */
export interface SheetCommand<Result extends SheetCommandResult = SheetCommandResult> {
  /** Stable, domain-owned command identifier for observability and automation. */
  readonly id: string;
  /** Runs command logic and returns a pipeline-backed result. */
  execute(context: SheetCommandContext): Result;
}

/** Local runtime effects that commands can request outside OT state. */
export type SheetCommandEffect =
  | {
      /** Scrolls the active selection into view. */
      readonly kind: 'ensure-selection-visible';
      /** Anchor cell coordinate of the selection to reveal. */
      readonly anchor: readonly [number, number];
      /** Focus cell coordinate of the selection to reveal. */
      readonly focus: readonly [number, number];
    }
  | {
      /** Moves keyboard focus to the editor surface. */
      readonly kind: 'focus-editor';
    };

/**
 * Work produced by a Sheet command for the editor to apply.
 *
 * The pipeline carries the state and render work. Effects are local runtime
 * actions such as focusing the editor or revealing the selection; they run
 * only after the pipeline call succeeds.
 */
export interface SheetCommandResult {
  /** Pipeline containing transaction, render, interaction and local-action steps. */
  readonly pipeline: Pipeline;
  /** Optional local effects requested after pipeline execution. */
  readonly effects?: readonly SheetCommandEffect[];
  /** Optional asynchronous completion of a command-owned external effect. */
  readonly completion?: Promise<unknown>;
  /** Optional identifier for combining two committed commands into one undo entry. */
  readonly historyGroup?: { readonly id: string; readonly phase: 'begin' | 'end' };
}

/**
 * Applies one Sheet command result through an editor-supplied context.
 *
 * The dispatcher calls the command, checks that it returned a result with a
 * pipeline, then runs that pipeline before its local effects. It does not own
 * Sheet state; the context supplies the transaction boundary.
 */
export class SheetCommandDispatcher {
  /**
   * Runs the command and applies its pipeline followed by its local effects.
   * @returns The result produced by the command after the context calls finish.
   * @throws SearError if the command returns no result or no pipeline. Errors
   * from command execution, the pipeline, or an effect propagate to the caller.
   */
  execute<Result extends SheetCommandResult>(context: SheetCommandContext, command: SheetCommand<Result>): Result {
    const result = command.execute(context);
    if (!result) throw new SearError(`Command ${command.id} completed without a result.`);
    if (!result.pipeline) throw new SearError(`Command ${command.id} completed without a pipeline.`);
    context.executePipeline(result.pipeline);
    result.effects?.forEach((effect) => context.applyEffect(effect));
    return result;
  }
}
