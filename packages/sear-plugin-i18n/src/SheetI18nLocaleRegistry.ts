import { SearError } from '@searsuite/sear-foundation-error';
import { defineRuntimeCapability } from '@searsuite/sear-assembly-plugin';
import { type CellFormatLocale } from '@searsuite/sear-domain-cell-types';
import {
  type FormulaDateTimeLocale,
  type FormulaDateTimeSymbols,
  type FormulaTextLocale,
} from '@searsuite/sear-domain-formula-engine';
import { Injectable } from '@searsuite/sear-foundation-di';
import {
  ChineseExcelDateTimeSymbols,
  CjkFormulaTextLocale,
  createExcelDateTimeLocale,
  EnglishExcelDateTimeLocale,
  EnglishExcelDateTimeSymbols,
} from '@searsuite/sear-domain-formula-engine-ts';
import { SheetI18nBuiltInLocale } from './SheetI18nTypes';

/** Locale contribution registered with the editor-local i18n registry. */
export interface SheetI18nLocaleRegistration {
  /** Stable locale id, normally a BCP-47 tag such as en, zh-CN, ja-JP, or fr-FR. */
  readonly locale: string;
  /** User-facing language label supplied by the owner. */
  readonly displayName: string;
  /** Formula date/time parser and formatter for this locale. */
  readonly dateTimeLocale?: FormulaDateTimeLocale;
  /** Formula text byte/width strategy for DBCS-compatible functions. */
  readonly textLocale?: FormulaTextLocale;
  /** Locale-specific date/time symbols used by the shared Excel parser. */
  readonly dateTimeSymbols?: FormulaDateTimeSymbols;
  /** Sheet cell number and date/time display defaults for this locale. */
  readonly cellFormatLocale?: CellFormatLocale;
}

/** Normalized locale contribution stored by the editor-local registry. */
export interface SheetI18nLocaleEntry {
  /** Stable locale id, normally a BCP-47 tag such as en, zh-CN, ja-JP, or fr-FR. */
  readonly locale: string;
  /** User-facing language label supplied by the owner. */
  readonly displayName: string;
  /** Formula date/time parser and formatter for this locale. */
  readonly dateTimeLocale: FormulaDateTimeLocale;
  /** Formula text byte/width strategy for DBCS-compatible functions. */
  readonly textLocale: FormulaTextLocale;
  /** Locale-specific date/time symbols used by the shared Excel parser. */
  readonly dateTimeSymbols?: FormulaDateTimeSymbols;
  /** Sheet cell number and date/time display defaults for this locale. */
  readonly cellFormatLocale: CellFormatLocale;
}

/** Runtime capability that exposes the sheet i18n locale registry to plugins and hosts. */
export const SheetI18nLocaleRegistryCapability =
  defineRuntimeCapability<SheetI18nLocaleRegistry>('sheet.i18n.localeRegistry');

/** Editor-local registry for built-in and third-party locale contributions. */
@Injectable()
export class SheetI18nLocaleRegistry {
  /** DI token for resolving SheetI18nLocaleRegistry. */
  public static readonly symbol = Symbol.for('SheetI18nLocaleRegistry');

  readonly #registrations = new Map<string, { id: number; entry: SheetI18nLocaleEntry }>();
  #nextId = 0;
  #isCommandExecuting: (() => boolean) | null = null;
  #dispatchRemoval: ((id: number) => void) | null = null;

  /** Registers one locale contribution and returns an idempotent disposer. */
  public register(registration: SheetI18nLocaleRegistration): () => void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Sheet i18n locale registration must run through editor.commands.run(...).');
    }
    const locale = normalizeLocaleId(registration.locale);
    if (!locale) throw new SearError('Sheet i18n locale registrations require a non-empty locale id.');
    if (this.#registrations.has(locale)) {
      throw new SearError(`Sheet i18n locale "${locale}" is already registered.`);
    }
    const symbols = lockDateTimeSymbols(registration.dateTimeSymbols);
    const dateTimeLocale = registration.dateTimeLocale ??
      createExcelDateTimeLocale({ locale, symbols: symbols ?? EnglishExcelDateTimeSymbols });
    const entry: SheetI18nLocaleEntry = Object.freeze({
      ...registration,
      locale,
      ...(symbols ? { dateTimeSymbols: symbols } : {}),
      dateTimeLocale: lockLocaleStrategy(dateTimeLocale),
      textLocale: lockLocaleStrategy(registration.textLocale ?? CjkFormulaTextLocale),
      cellFormatLocale: Object.freeze({ ...(registration.cellFormatLocale ?? createDefaultCellFormatLocale(locale)) }),
    });
    const id = this.#nextId++;
    this.#registrations.set(locale, { id, entry });
    let disposed = false;
    const registry = this;
    return function unregisterSheetI18nLocale(): void {
      if (disposed) return;
      registry.unregister(id);
      disposed = true;
    };
  }

  /** Removes one contribution through the locale owner's command after assembly. */
  public unregister(id: number): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      this.#dispatchRemoval!(id);
      return;
    }
    for (const [locale, registration] of this.#registrations) {
      if (registration.id !== id) continue;
      this.#registrations.delete(locale);
      return;
    }
  }

  /** Seals runtime registrations after every plugin has started. */
  public enforceCommandBoundary(isExecuting: () => boolean, dispatchRemoval: (id: number) => void): void {
    if (this.#isCommandExecuting) throw new SearError('Sheet i18n locale registry is already bound to an editor.');
    this.#isCommandExecuting = isExecuting;
    this.#dispatchRemoval = dispatchRemoval;
    Object.preventExtensions(this);
  }

  /** Returns whether a locale id is registered. */
  public has(locale: string): boolean {
    return this.#registrations.has(normalizeLocaleId(locale));
  }

  /** Returns a registered locale contribution, if present. */
  public get(locale: string): SheetI18nLocaleEntry | undefined {
    return this.#registrations.get(normalizeLocaleId(locale))?.entry;
  }

  /** Returns a required locale contribution. */
  public require(locale: string): SheetI18nLocaleEntry {
    const registration = this.get(locale);
    if (!registration) throw new SearError(`Sheet i18n locale "${locale}" is not registered.`);
    return registration;
  }

  /** Lists registered locale contributions in stable locale-id order. */
  public list(): readonly SheetI18nLocaleEntry[] {
    return [...this.#registrations.values()].map(({ entry }) => entry)
      .sort((left, right) => left.locale.localeCompare(right.locale));
  }
}

function lockLocaleStrategy<T extends object>(strategy: T): T {
  const symbols = 'symbols' in strategy ? strategy.symbols as FormulaDateTimeSymbols | undefined : undefined;
  if (symbols) lockDateTimeSymbols(symbols);
  return Object.freeze(strategy);
}

function lockDateTimeSymbols(symbols: FormulaDateTimeSymbols | undefined): FormulaDateTimeSymbols | undefined {
  if (!symbols) return undefined;
  symbols.months?.forEach(Object.freeze);
  symbols.meridiems?.forEach(Object.freeze);
  if (symbols.months) Object.freeze(symbols.months);
  if (symbols.meridiems) Object.freeze(symbols.meridiems);
  if (symbols.units) {
    Object.values(symbols.units).forEach((values) => { if (values) Object.freeze(values); });
    Object.freeze(symbols.units);
  }
  return Object.freeze(symbols);
}

/** Registers the default English and Chinese locale contributions. */
export function registerBuiltInSheetI18nLocales(registry: SheetI18nLocaleRegistry): void {
  registerIfMissing(registry, {
    locale: SheetI18nBuiltInLocale.English,
    displayName: 'English',
    dateTimeLocale: EnglishExcelDateTimeLocale,
    dateTimeSymbols: EnglishExcelDateTimeSymbols,
    textLocale: CjkFormulaTextLocale,
    cellFormatLocale: {
      locale: 'en',
      datePattern: 'm/d/yyyy',
      timePattern: 'h:mm:ss',
      dateTimePattern: 'm/d/yyyy h:mm:ss',
    },
  });
  registerIfMissing(registry, {
    locale: SheetI18nBuiltInLocale.Chinese,
    displayName: 'Chinese',
    dateTimeSymbols: ChineseExcelDateTimeSymbols,
    textLocale: CjkFormulaTextLocale,
    cellFormatLocale: {
      locale: 'zh-CN',
      datePattern: 'yyyy\u5e74m\u6708d\u65e5',
      timePattern: 'h:mm:ss',
      dateTimePattern: 'yyyy\u5e74m\u6708d\u65e5 h:mm:ss',
    },
  });
}

function registerIfMissing(registry: SheetI18nLocaleRegistry, registration: SheetI18nLocaleRegistration): void {
  if (!registry.has(registration.locale)) registry.register(registration);
}

function normalizeLocaleId(locale: string): string {
  return locale.trim();
}

function createDefaultCellFormatLocale(locale: string): CellFormatLocale {
  return {
    locale,
    datePattern: 'yyyy-m-d',
    timePattern: 'h:mm:ss',
    dateTimePattern: 'yyyy-m-d h:mm:ss',
  };
}
