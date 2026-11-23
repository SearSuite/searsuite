import { defineSheetCommand, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { type SheetI18nLocaleRegistry } from './SheetI18nLocaleRegistry';

/** Removes one editor-local locale contribution. */
export const UnregisterSheetI18nLocaleCommand =
  defineSheetCommand<number>('sheet.i18n.locale.unregister');

/** Binds locale contribution disposal to its owning Sheet command. */
export function registerSheetI18nLocaleCommands(commands: SheetCommandBus, locales: SheetI18nLocaleRegistry): void {
  commands.register(UnregisterSheetI18nLocaleCommand, (id) =>
    new LocalActionCommand(UnregisterSheetI18nLocaleCommand.id, () => locales.unregister(id)));
}
