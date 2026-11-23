import { defineSheetCommand } from '@searsuite/sear-assembly-commands';

/** Input for setting the editor-local language. */
export interface SetSheetLocaleInput {
  readonly locale: string;
}

/** Command that updates the editor-local language. */
export const SetSheetLocaleCommand = defineSheetCommand<SetSheetLocaleInput>('sheet.i18n.setLocale');

/** Command that toggles between the built-in English and Chinese locales. */
export const ToggleSheetLocaleCommand = defineSheetCommand<void>('sheet.i18n.toggleLocale');
