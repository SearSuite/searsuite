import { Pipeline } from '@searsuite/sear-assembly-plugin';
import {
  type DocCommandContext,
  type DocCommandResult,
  type DocEditorCommand,
} from '@searsuite/sear-assembly-commands';
import { type Transaction } from '@searsuite/sear-domain-transaction';

/** Creates a pipeline-backed document command with an optional transaction or local action. */
export function createDocCommand(
  id: string,
  createTransaction?: () => Transaction,
  effects: DocCommandResult['effects'] = [],
  localAction?: () => void,
): DocEditorCommand {
  return {
    id,
    execute(_context: DocCommandContext): DocCommandResult {
      const transaction = createTransaction?.();
      const pipeline = new Pipeline(id);
      if (transaction) pipeline.addTransaction(id, transaction);
      if (localAction) pipeline.addLocalAction(id, localAction);

      return {
        pipeline,
        effects,
      };
    },
  };
}
