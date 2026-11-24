import { SearError } from '@searsuite/sear-foundation-error';
import { LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { SearCoreSheet, runOutsideCommandExecution } from '@searsuite/sear-assembly-core';
import { type CellFormatLocale, ICellFormatLocaleProvider } from '@searsuite/sear-domain-cell-types';
import {
  Plugin,
  PluginKey,
  type RuntimeCapabilityRegistry,
  SessionStateRegistry,
  SessionStateRestorePhase,
  defineSessionState,
} from '@searsuite/sear-assembly-plugin';
import {
  type FormulaDateTimeLocale,
  type FormulaTextLocale,
  IFormulaLocaleProvider,
} from '@searsuite/sear-domain-formula-engine';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Container, Inject, Injectable, Scope } from '@searsuite/sear-foundation-di';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { RecalcScheduler } from '@searsuite/sear-plugin-formula';
import { Node } from '@searsuite/sear-render-node';
import { type CellProperties } from '@searsuite/sear-render-registry';
import {
  registerBuiltInSheetI18nLocales,
  SheetI18nLocaleRegistry,
  SheetI18nLocaleRegistryCapability,
} from '../../SheetI18nLocaleRegistry';
import { registerSheetI18nLocaleCommands, UnregisterSheetI18nLocaleCommand } from '../../SheetI18nLocaleCommands';
import { SetSheetLocaleCommand, ToggleSheetLocaleCommand } from '../../SheetI18nCommands';
import { SheetI18nStateObservation } from '../../SheetI18nObservations';
import {
  isSheetI18nLocale,
  SheetI18nBuiltInLocale,
  type SheetI18nLocale,
  type SheetI18nState,
} from '../../SheetI18nTypes';

const pluginKey = new PluginKey('SheetI18n');

/** Local sheet i18n locale retained during in-memory editor remounts. */
export const SheetI18nSessionStateDefinition = defineSessionState<SheetI18nState>('sheet.i18n');

/** Editor-local i18n plugin for built-in English and Chinese locale services. */
@Injectable()
export class SheetI18nPlugin
  extends Plugin<SearCoreSheet, CellProperties, null>
  implements IFormulaLocaleProvider, ICellFormatLocaleProvider
{
  readonly #locales: SheetI18nLocaleRegistry;

  /** DI token for resolving SheetI18nPlugin. */
  public static readonly symbol = Symbol.for('SheetI18nPlugin');
  /** Stable plugin key for SheetI18nPlugin. */
  public static readonly pluginKey = pluginKey;

  readonly #listeners = new Set<(state: SheetI18nState) => void>();
  #locale: SheetI18nLocale = SheetI18nBuiltInLocale.English;
  #commands: SheetCommandBus | null = null;
  #scheduler: RecalcScheduler | null = null;
  #runtimeWritesSealed = false;

  /** Publishes this plugin as the editor-local formula locale provider. */
  public static registerServices(context: { readonly container: Container }): void {
    if (!context.container.hasBinding(SheetI18nLocaleRegistry.symbol)) {
      context.container.register(SheetI18nLocaleRegistry.symbol, SheetI18nLocaleRegistry, Scope.Singleton);
    }
    context.container.registerFactory(
      IFormulaLocaleProvider.symbol,
      () => context.container.resolve<SheetI18nPlugin>(SheetI18nPlugin.symbol),
      Scope.Singleton,
    );
    context.container.registerFactory(
      ICellFormatLocaleProvider.symbol,
      () => context.container.resolve<SheetI18nPlugin>(SheetI18nPlugin.symbol),
      Scope.Singleton,
    );
  }

  /** Creates a SheetI18nPlugin instance. */
  public constructor(
    @Inject(SheetI18nLocaleRegistry.symbol)
    locales: SheetI18nLocaleRegistry,
  ) {
    super({ key: pluginKey, state: null });
    this.#locales = locales;
    Object.defineProperty(this, 'locales', { writable: false, configurable: false });
    registerBuiltInSheetI18nLocales(this.#locales);
  }

  /** Registers language switching commands. */
  public registerCommands(commands: SheetCommandBus): void {
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet i18n commands are already bound to an editor.');
    }
    this.#commands = commands;
    const plugin = this;
    commands.register(SetSheetLocaleCommand, function createSetSheetLocaleCommand(input) {
      return new LocalActionCommand(SetSheetLocaleCommand.id, function applySheetLocale(): void {
        plugin.#applyLocale(input.locale);
      });
    });
    commands.register(ToggleSheetLocaleCommand, function createToggleSheetLocaleCommand() {
      return new LocalActionCommand(ToggleSheetLocaleCommand.id, function toggleSheetLocale(): void {
        plugin.#applyLocale(
          plugin.#locale === SheetI18nBuiltInLocale.English ? SheetI18nBuiltInLocale.Chinese : SheetI18nBuiltInLocale.English,
        );
      });
    });
    registerSheetI18nLocaleCommands(commands, this.#locales);
  }

  public sealRuntimeWrites(): void {
    if (!this.#commands) throw new SearError('Sheet i18n commands must be registered before sealing locales.');
    if (this.#runtimeWritesSealed) throw new SearError('Sheet i18n runtime writes are already sealed.');
    const commands = this.#commands;
    SheetI18nLocaleRegistry.prototype.enforceCommandBoundary.call(this.#locales, commands.isExecuting.bind(commands),
      (id) => commands.run(UnregisterSheetI18nLocaleCommand, id));
    this.#runtimeWritesSealed = true;
  }

  /** Registers the current i18n state observation. */
  public registerObservations(observations: ObservationRegistry): void {
    observations.register(SheetI18nStateObservation, {
      getSnapshot: this.#getStateSnapshot.bind(this),
      subscribe: (listener) => this.#subscribe(listener),
    });
  }

  /** Registers local i18n state for in-memory editor remounts. */
  public registerSessionState(registry: SessionStateRegistry): void {
    this.registerOwnedSessionState(registry, () => {
      registry.register(SheetI18nSessionStateDefinition, {
        restorePhase: SessionStateRestorePhase.BeforeInitialize,
        capture: this.#getStateSnapshot.bind(this),
        restore: (state) => {
          SessionStateRegistry.prototype.assertRestorationOpen.call(registry);
          if (isSheetI18nLocale(state?.locale)) this.#locale = state.locale;
        },
      });
    });
  }

  /** Publishes the i18n locale registry for third-party locale contributions. */
  public registerCapabilities(registry: RuntimeCapabilityRegistry): void {
    registry.register(SheetI18nLocaleRegistryCapability, this.#locales);
  }

  /** Discovers formula scheduling after the formula runtime has registered its services. */
  public initialize(context: { readonly container: Container }): void {
    if (this.#runtimeWritesSealed) throw new SearError('Sheet i18n scheduler cannot change after editor assembly.');
    if (!context.container.hasBinding(RecalcScheduler.symbol)) return;
    this.#scheduler = context.container.resolve<RecalcScheduler>(RecalcScheduler.symbol);
  }

  /** IFormulaLocaleProvider implementation. */
  public getDateTimeLocale(): FormulaDateTimeLocale {
    return (this.#locales.get(this.#locale) ?? this.#locales.require(SheetI18nBuiltInLocale.English)).dateTimeLocale;
  }

  /** IFormulaLocaleProvider implementation. */
  public getTextLocale(): FormulaTextLocale {
    return (this.#locales.get(this.#locale) ?? this.#locales.require(SheetI18nBuiltInLocale.English)).textLocale;
  }

  /** ICellFormatLocaleProvider implementation. */
  public getCellFormatLocale(): CellFormatLocale {
    return (this.#locales.get(this.#locale) ?? this.#locales.require(SheetI18nBuiltInLocale.English)).cellFormatLocale;
  }

  /** Returns the active locale. */
  public getLocale(): SheetI18nLocale {
    return this.#locale;
  }

  /** Updates the active locale and notifies observers. */
  public setLocale(locale: SheetI18nLocale): void {
    if (this.#commands) {
      this.#commands.run(SetSheetLocaleCommand, { locale });
      return;
    }
    this.#applyLocale(locale);
  }

  #applyLocale(locale: SheetI18nLocale): void {
    if (!isSheetI18nLocale(locale)) throw new SearError(`Unsupported sheet i18n locale "${String(locale)}".`);
    if (!this.#locales.has(locale)) throw new SearError(`Sheet i18n locale "${locale}" is not registered.`);
    if (locale === this.#locale) return;
    this.#locale = locale;
    this.#publish();
    this.#scheduler?.markDirty([...this.#scheduler.getFormulaKeys()]);
  }

  /** Toggles between English and Chinese. */
  public toggleLocale(): void {
    if (this.#commands) {
      this.#commands.run(ToggleSheetLocaleCommand, undefined);
      return;
    }
    this.setLocale(
      this.#locale === SheetI18nBuiltInLocale.English ? SheetI18nBuiltInLocale.Chinese : SheetI18nBuiltInLocale.English,
    );
  }

  /** Registers private plugin state. */
  public registerState() {
    return { key: this.key, state: this.getState(), dataEngine: { enabled: false } };
  }

  /** Returns the plugin config. */
  public getPluginConfig(): null {
    return null;
  }

  /** Applies no document mutations because i18n is local runtime state. */
  public apply(state: null, _transaction: Transaction): null {
    return state;
  }

  /** This plugin renders no scene nodes. */
  public render(): Node<CellProperties>[] {
    return [];
  }

  #subscribe(listener: (state: SheetI18nState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #publish(): void {
    const snapshot = this.#getStateSnapshot();
    runOutsideCommandExecution(() => this.#listeners.forEach((listener) => listener(snapshot)));
  }

  #getStateSnapshot(): SheetI18nState {
    return { locale: this.#locale };
  }
}
