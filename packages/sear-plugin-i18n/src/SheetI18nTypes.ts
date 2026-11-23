/** Built-in locale identifiers registered by sear-plugin-i18n. */
export const SheetI18nBuiltInLocale = {
  English: 'en',
  Chinese: 'zh',
} as const;

/** Locale ids are open so third-party plugins can register their own BCP-47 tags. */
export type SheetI18nLocale = string;

/** Snapshot published by the sheet i18n observation. */
export interface SheetI18nState {
  readonly locale: SheetI18nLocale;
}

/** Returns whether a value is a non-empty locale id. */
export function isSheetI18nLocale(value: unknown): value is SheetI18nLocale {
  return typeof value === 'string' && value.trim().length > 0;
}
