import { SearError } from '@searsuite/sear-foundation-error';
import { type DocCommandContext, type DocCommandResult, type DocEditorCommand } from './DocEditorCommandTypes';

/**
 * Applies one document command result through an editor-supplied context.
 *
 * It validates the command's result, delegates its pipeline to the document
 * core, and applies local effects only after that call succeeds. The command
 * bus handles registration and lifecycle notifications around this dispatch.
 */
export class DocCommandDispatcher {
  /**
   * Runs the command and applies its pipeline followed by its local effects.
   * @returns The result produced by the command after the context calls finish.
   * @throws SearError if the command returns no result or no pipeline. Errors
   * from command execution, the pipeline, or an effect propagate to the caller.
   */
  execute<Result extends DocCommandResult>(context: DocCommandContext, command: DocEditorCommand<Result>): Result {
    const result = command.execute(context);
    if (!result) throw new SearError(`Doc command ${command.id} completed without a result.`);
    if (!result.pipeline) throw new SearError(`Doc command ${command.id} completed without a pipeline.`);
    context.executePipeline(result.pipeline);
    result.effects?.forEach((effect) => context.applyEffect(effect));
    return result;
  }
}
