import { Pipeline } from '@searsuite/sear-assembly-core';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import {
  type DocCommandContext,
  type DocCommandResult,
  type DocEditorCommand,
} from '@searsuite/sear-assembly-commands';
import { type Transaction } from '@searsuite/sear-domain-transaction';

/** Creates a pipeline-backed document command with an optional transaction or local action. */
export function createDocCommand(
  id: string,
  renderPluginKey: PluginKey | readonly PluginKey[],
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
      addDocCommandRenderSteps(pipeline, id, renderPluginKey);

      return {
        pipeline,
        effects,
      };
    },
  };
}

function addDocCommandRenderSteps(
  pipeline: Pipeline,
  operationName: string,
  renderPluginKey: PluginKey | readonly PluginKey[],
): void {
  const pluginKeys = Array.isArray(renderPluginKey) ? renderPluginKey : [renderPluginKey];
  for (const pluginKey of pluginKeys) pipeline.addRender(`${operationName}:render:${pluginKey.key}`, pluginKey);
}
