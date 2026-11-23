import { defineSheetCommand, LocalActionCommand, SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { RuntimeCapabilityRegistry, SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import { ICellFormatLocaleProvider } from '@searsuite/sear-domain-cell-types';
import { IFormulaLocaleProvider } from '@searsuite/sear-domain-formula-engine';
import { Container, Scope } from '@searsuite/sear-foundation-di';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { RecalcScheduler } from '@searsuite/sear-plugin-formula';
import {
  SetSheetLocaleCommand,
  SheetI18nBuiltInLocale,
  SheetI18nLocaleRegistry,
  SheetI18nLocaleRegistryCapability,
  SheetI18nPlugin,
  SheetI18nSessionStateDefinition,
  SheetI18nStateObservation,
  ToggleSheetLocaleCommand,
  UnregisterSheetI18nLocaleCommand,
} from '../src';

function createBoundCommandBus(): SheetCommandBus {
  const commands = new SheetCommandBus();
  commands.bind({
    executePipeline: (pipeline) => pipeline.steps.forEach((step) => step.localAction?.()),
    applyEffect: () => void 0,
  });
  return commands;
}

function createPlugin(registry = new SheetI18nLocaleRegistry()): SheetI18nPlugin {
  return new SheetI18nPlugin(registry);
}

describe('SheetI18nPlugin', () => {
  it('publishes itself as the formula and cell-format locale provider', () => {
    const container = new Container();
    container.register(SheetI18nPlugin.symbol, SheetI18nPlugin, Scope.Singleton);
    SheetI18nPlugin.registerServices({ container });

    const provider = container.resolve<IFormulaLocaleProvider>(IFormulaLocaleProvider.symbol);
    expect(provider).toBe(container.resolve<SheetI18nPlugin>(SheetI18nPlugin.symbol));
    expect(provider.getDateTimeLocale().parseDateTime('22-MAY-2011')?.hasDate).toBe(true);
    expect(provider.getDateTimeLocale().parseDateTime('2021 \u5e74 12 \u6708 31 \u65e5')).toBeNull();
    expect(provider.getTextLocale?.().byteLength('A\u4e2dB')).toBe(4);
    const cellFormatProvider = container.resolve<ICellFormatLocaleProvider>(ICellFormatLocaleProvider.symbol);
    expect(cellFormatProvider).toBe(container.resolve<SheetI18nPlugin>(SheetI18nPlugin.symbol));
    expect(cellFormatProvider.getCellFormatLocale()).toMatchObject({
      locale: 'en',
      datePattern: 'm/d/yyyy',
    });
  });

  it('sets and toggles locale through commands and publishes observation snapshots', () => {
    const plugin = createPlugin();
    const commands = createBoundCommandBus();
    const observations = new ObservationRegistry();
    const snapshots: string[] = [];

    plugin.registerCommands(commands);
    plugin.registerObservations(observations);
    observations.subscribe(SheetI18nStateObservation, (state) => snapshots.push(state.locale));

    commands.run(SetSheetLocaleCommand, { locale: SheetI18nBuiltInLocale.Chinese });
    expect(plugin.getLocale()).toBe(SheetI18nBuiltInLocale.Chinese);
    expect(plugin.getDateTimeLocale().parseDateTime('2021 \u5e74 12 \u6708 31 \u65e5')?.hasDate).toBe(true);
    expect(plugin.getDateTimeLocale().parseDateTime('22-MAY-2011')?.hasDate).toBe(true);
    expect(plugin.getTextLocale().byteLength('A\u4e2dB')).toBe(4);
    expect(plugin.getCellFormatLocale()).toMatchObject({
      locale: 'zh-CN',
      datePattern: 'yyyy\u5e74m\u6708d\u65e5',
    });

    commands.run(ToggleSheetLocaleCommand, undefined);
    expect(plugin.getLocale()).toBe(SheetI18nBuiltInLocale.English);
    expect(snapshots).toEqual([
      SheetI18nBuiltInLocale.English,
      SheetI18nBuiltInLocale.Chinese,
      SheetI18nBuiltInLocale.English,
    ]);
  });

  it('routes public locale setters through the registered command bus', () => {
    const plugin = createPlugin();
    const commands = createBoundCommandBus();
    plugin.registerCommands(commands);
    expect(() => plugin.registerCommands(createBoundCommandBus())).toThrow('already bound');
    const events: string[] = [];
    const dispose = commands.subscribe((event) => events.push(event.id));

    plugin.setLocale(SheetI18nBuiltInLocale.Chinese);
    plugin.toggleLocale();
    (plugin as unknown as { locale: string }).locale = SheetI18nBuiltInLocale.Chinese;

    expect(plugin.getLocale()).toBe(SheetI18nBuiltInLocale.English);
    expect(events).toEqual([
      SetSheetLocaleCommand.id,
      SetSheetLocaleCommand.id,
      ToggleSheetLocaleCommand.id,
      ToggleSheetLocaleCommand.id,
    ]);
    dispose();
  });

  it('restores locale from session state', () => {
    const plugin = createPlugin();
    const session = new SessionStateRegistry();

    session.loadSnapshot({ [SheetI18nSessionStateDefinition.id]: { locale: SheetI18nBuiltInLocale.Chinese } });
    plugin.registerSessionState(session);
    expect(() => plugin.registerSessionState(new SessionStateRegistry())).toThrow('already bound');
    session.restorePhase('beforeInitialize');

    expect(plugin.getLocale()).toBe(SheetI18nBuiltInLocale.Chinese);
    expect(session.capture()[SheetI18nSessionStateDefinition.id]).toEqual({ locale: SheetI18nBuiltInLocale.Chinese });
  });

  it('marks formulas dirty when locale changes and a scheduler is present', () => {
    const container = new Container();
    const scheduler = {
      getFormulaKeys: () => new Map([[1, {}]]).keys(),
      markDirty: jest.fn(),
    };
    container.registerInstance(RecalcScheduler.symbol, scheduler as never);
    const plugin = createPlugin();
    plugin.initialize({ container });

    plugin.setLocale(SheetI18nBuiltInLocale.Chinese);

    expect(scheduler.markDirty).toHaveBeenCalledWith([1]);
  });

  it('accepts third-party locale registrations through the registry capability', () => {
    const registry = new SheetI18nLocaleRegistry();
    const plugin = createPlugin(registry);
    const capabilities = new RuntimeCapabilityRegistry('test');
    plugin.registerCapabilities(capabilities);

    capabilities.require(SheetI18nLocaleRegistryCapability).register({
      locale: 'fr-FR',
      displayName: 'Français',
      cellFormatLocale: {
        locale: 'fr-FR',
        datePattern: 'dd/mm/yyyy',
        timePattern: 'hh:mm:ss',
        dateTimePattern: 'dd/mm/yyyy hh:mm:ss',
      },
      dateTimeLocale: {
        locale: 'fr-FR',
        parseDateTime: () => ({ serial: 45365, hasDate: true, hasTime: false }),
        formatDateTime: () => '14/03/2024',
      },
    });

    plugin.setLocale('fr-FR');

    expect(plugin.getLocale()).toBe('fr-FR');
    expect(plugin.getDateTimeLocale().parseDateTime('14 mars 2024')?.serial).toBe(45365);
    expect(plugin.getCellFormatLocale().datePattern).toBe('dd/mm/yyyy');
    expect(registry.list().map((registration) => registration.locale)).toEqual(['en', 'fr-FR', 'zh']);
  });

  it('seals runtime locale registration and routes disposal through a command', () => {
    const registry = new SheetI18nLocaleRegistry();
    const plugin = createPlugin(registry);
    const commands = createBoundCommandBus();
    const RegisterLocaleCommand = defineSheetCommand<void>('test.i18n.registerLocale');
    const cellFormatLocale = {
      locale: 'fr-FR', datePattern: 'dd/mm/yyyy', timePattern: 'hh:mm:ss',
      dateTimePattern: 'dd/mm/yyyy hh:mm:ss',
    };
    let disposeLocale: (() => void) | undefined;
    commands.register(RegisterLocaleCommand, () => new LocalActionCommand(RegisterLocaleCommand.id, () => {
      disposeLocale = registry.register({ locale: 'fr-FR', displayName: 'Français', cellFormatLocale });
    }));
    plugin.registerCommands(commands);
    plugin.sealRuntimeWrites();
    expect(() => plugin.initialize({ container: { hasBinding: () => true } as never }))
      .toThrow('cannot change after editor assembly');
    const events: string[] = [];
    const unsubscribe = commands.subscribe((event) => {
      if (event.phase === 'completed') events.push(event.id);
    });
    try {
      expect(() => registry.register({ locale: 'de-DE', displayName: 'Deutsch' }))
        .toThrow('editor.commands.run');
      commands.run(RegisterLocaleCommand, undefined);
      cellFormatLocale.datePattern = 'changed';
      expect(registry.require('fr-FR').cellFormatLocale.datePattern).toBe('dd/mm/yyyy');
      expect(() => {
        (registry.require('fr-FR').cellFormatLocale as { datePattern: string }).datePattern = 'changed';
      }).toThrow();
      disposeLocale!();
      disposeLocale!();
      expect(registry.has('fr-FR')).toBe(false);
      expect(events).toEqual([RegisterLocaleCommand.id, UnregisterSheetI18nLocaleCommand.id]);
    } finally {
      unsubscribe();
    }
  });

  it('creates third-party date/time locales from registered symbols with English fallback', () => {
    const registry = new SheetI18nLocaleRegistry();
    const plugin = createPlugin(registry);

    registry.register({
      locale: 'ja-JP',
      displayName: 'Japanese',
      dateTimeSymbols: {
        units: {
          year: ['\u5e74'],
          month: ['\u6708'],
          day: ['\u65e5'],
        },
        meridiems: [
          { text: '\u5348\u524d', period: 'am' },
          { text: '\u5348\u5f8c', period: 'pm' },
        ],
      },
    });

    plugin.setLocale('ja-JP');

    expect(plugin.getDateTimeLocale().parseDateTime('2024\u5e743\u670814\u65e5')?.serial).toBe(45365);
    expect(plugin.getDateTimeLocale().parseDateTime('14-MAR-2024')?.serial).toBe(45365);
  });

  it('exports command definitions with stable ids', () => {
    expect(SetSheetLocaleCommand.id).toBe('sheet.i18n.setLocale');
    expect(ToggleSheetLocaleCommand.id).toBe('sheet.i18n.toggleLocale');
    expect(LocalActionCommand).toBeDefined();
  });
});
