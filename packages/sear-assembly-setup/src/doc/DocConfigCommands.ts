import { type ConfigEngine, type DocConfig, type EditorDefaultConfigOverrides } from '@searsuite/sear-assembly-config';
import { defineDocCommand, type DocCommandBus, type DocEditorCommand } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-plugin';

/** Updates editor-local Doc defaults without changing document state. */
export const UpdateDocDefaultConfigCommand =
  defineDocCommand<EditorDefaultConfigOverrides<DocConfig>>('doc.config.updateDefaults');

/** Registers Doc configuration changes on the owning command bus. */
export function registerDocConfigCommands(commands: DocCommandBus, config: ConfigEngine<DocConfig>): void {
  commands.register(
    UpdateDocDefaultConfigCommand,
    (overrides): DocEditorCommand => ({
      id: UpdateDocDefaultConfigCommand.id,
      execute: () => ({
        pipeline: new Pipeline(UpdateDocDefaultConfigCommand.id).addLocalAction(UpdateDocDefaultConfigCommand.id, () =>
          config.updateDefaultConfigOverrides(overrides),
        ),
      }),
    }),
  );
}
