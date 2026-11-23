import { defineSheetCommand, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { type SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';

/** Removes one editor-local input validator through the Sheet command bus. */
export const UnregisterSheetInputValidatorCommand =
  defineSheetCommand<number>('sheet.inputValidation.unregister');

/** Installs the input-validation registry's runtime disposal command. */
export function registerSheetInputValidationCommands(
  commands: SheetCommandBus,
  validation: SheetCellInputValidationRegistry,
): void {
  commands.register(UnregisterSheetInputValidatorCommand, (id) =>
    new LocalActionCommand(UnregisterSheetInputValidatorCommand.id, () => validation.unregister(id)));
}
