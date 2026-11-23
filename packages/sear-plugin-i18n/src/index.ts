/**
 * Editor-local locale registration and built-in English and Chinese formula locales.
 *
 * @packageDocumentation
 */

export { SheetI18nPlugin, SheetI18nSessionStateDefinition } from './sheetPlugin/i18n/SheetI18nPlugin';
export { SetSheetLocaleCommand, ToggleSheetLocaleCommand, type SetSheetLocaleInput } from './SheetI18nCommands';
export { SheetI18nStateObservation } from './SheetI18nObservations';
export {
  SheetI18nLocaleRegistry,
  SheetI18nLocaleRegistryCapability,
  registerBuiltInSheetI18nLocales,
  type SheetI18nLocaleEntry,
  type SheetI18nLocaleRegistration,
} from './SheetI18nLocaleRegistry';
export { UnregisterSheetI18nLocaleCommand } from './SheetI18nLocaleCommands';
export { SheetI18nBuiltInLocale, isSheetI18nLocale, type SheetI18nLocale, type SheetI18nState } from './SheetI18nTypes';
