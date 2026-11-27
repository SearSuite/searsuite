import {
  type EditorDefaultConfigOverrides,
  type SheetConfig,
  type ConfigEngine,
} from '@searsuite/sear-assembly-config';
import { defineSheetCommand, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';

/** Updates editor-local Sheet defaults without changing document state. */
export const UpdateSheetDefaultConfigCommand =
  defineSheetCommand<EditorDefaultConfigOverrides<SheetConfig>>('sheet.config.updateDefaults');

/** Registers Sheet configuration changes on the owning command bus. */
export function registerSheetConfigCommands(commands: SheetCommandBus, config: ConfigEngine<SheetConfig>): void {
  commands.register(
    UpdateSheetDefaultConfigCommand,
    (overrides) =>
      new LocalActionCommand(UpdateSheetDefaultConfigCommand.id, () => config.updateDefaultConfigOverrides(overrides)),
  );
}
