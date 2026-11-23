import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { CellTypeCatalog, registerBuiltinCellDefinitions } from '@searsuite/sear-domain-cell';
import {
  IAggregationCache,
  IDependencyGraph,
  IFormulaCalculationTraceProvider,
  IFormulaEvaluator,
  IFormulaResultProvider,
  IFormulaRichResultProvider,
  IFormulaSourceProvider,
  IFormulaStatusProvider,
  IFunctionRegistry,
  IFormulaLocaleProvider,
  IFormulaTextServiceProvider,
  IFormulaExternalServiceProvider,
  IFormulaWorkbookMetadataProvider,
  IFormulaIterationSettingsProvider,
  FormulaAddInServiceDefinition,
} from '@searsuite/sear-domain-formula-engine';
import {
  AggregationCache,
  DependencyGraph,
  FormulaEvaluator,
  FunctionRegistry,
  FormulaTextServiceRegistry,
  FormulaExternalServiceRegistry,
  UnavailableFormulaAddInService,
  RAND,
  RANDBETWEEN,
  RANDARRAY,
  createDefaultFormulaLocaleProvider,
} from '@searsuite/sear-domain-formula-engine-ts';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import {
  CellFormulaValueConverterRegistry,
  FormulaCalculationTraceBus,
  FormulaRefShifter,
  FormulaRenderInvalidator,
  FormulaRichResultProviderRegistry,
  FormulaResultProviderRegistry,
  FormulaResultStore,
  FormulaSchedulerDataSource,
  FormulaSourceProviderRegistry,
  RecalcScheduler,
  SheetFormulaPlugin,
} from '@searsuite/sear-plugin-formula';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { SheetClipboardDataSourceSymbol } from '@searsuite/sear-plugin-clipboard';
import { DefaultSheetClipboardDataSource } from '../../DefaultSheetClipboardDataSource';
import { SheetFormulaSchedulerDataSource } from '../../SheetFormulaSchedulerDataSource';

/** Registers formula services and exposes the formula plugin as a render display provider. */
export function registerSheetFormulaPlugin(
  container: Container,
  manager: PluginManager<SearCoreSheet, CellProperties>,
): void {
  if (!container.hasBinding(IFunctionRegistry.symbol)) {
    container.register(IFunctionRegistry.symbol, FunctionRegistry, Scope.Singleton);
  }
  const functionRegistry = container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol);
  functionRegistry.register(RAND);
  functionRegistry.register(RANDBETWEEN);
  functionRegistry.register(RANDARRAY);
  if (!container.hasBinding(IFormulaLocaleProvider.symbol)) {
    container.registerInstance(IFormulaLocaleProvider.symbol, createDefaultFormulaLocaleProvider());
  }
  if (!container.hasBinding(IFormulaIterationSettingsProvider.symbol)) {
    container.registerInstance(IFormulaIterationSettingsProvider.symbol, {
      getSettings: () => ({ enabled: false, maxIterations: 0, maxChange: 0 }),
    });
  }
  if (!container.hasBinding(IFormulaTextServiceProvider.symbol)) {
    container.registerInstance(IFormulaTextServiceProvider.symbol, new FormulaTextServiceRegistry());
  }
  if (!container.hasBinding(IFormulaWorkbookMetadataProvider.symbol)) {
    container.registerInstance(IFormulaWorkbookMetadataProvider.symbol, { readWorkbook: () => undefined });
  }
  if (!container.hasBinding(IFormulaExternalServiceProvider.symbol)) {
    const platform = container.resolve<Platform>(Platform.symbol);
    container.registerInstance(
      IFormulaExternalServiceProvider.symbol,
      new FormulaExternalServiceRegistry((message, error) => platform.warn(message, error)),
    );
  }
  const externalServices = container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol);
  if (!externalServices.get(FormulaAddInServiceDefinition)) {
    externalServices.register(FormulaAddInServiceDefinition, new UnavailableFormulaAddInService());
  }
  container.register(IAggregationCache.symbol, AggregationCache, Scope.Singleton);
  container.register(IFormulaEvaluator.symbol, FormulaEvaluator, Scope.Singleton);
  container.register(IDependencyGraph.symbol, DependencyGraph, Scope.Singleton);
  container.register(CellFormulaValueConverterRegistry.symbol, CellFormulaValueConverterRegistry, Scope.Singleton);
  container.register(FormulaResultProviderRegistry.symbol, FormulaResultProviderRegistry, Scope.Singleton);
  container.register(FormulaRichResultProviderRegistry.symbol, FormulaRichResultProviderRegistry, Scope.Singleton);
  const formulaResults = container.resolve<FormulaResultProviderRegistry>(FormulaResultProviderRegistry.symbol);
  const formulaRichResults = container.resolve<FormulaRichResultProviderRegistry>(
    FormulaRichResultProviderRegistry.symbol,
  );
  container.registerInstance(IFormulaResultProvider.symbol, formulaResults);
  if (container.hasBinding(SheetClipboardDataSourceSymbol)) {
    container.resolve<DefaultSheetClipboardDataSource>(SheetClipboardDataSourceSymbol).bindFormulaResults(formulaResults);
  }
  container.registerInstance(IFormulaRichResultProvider.symbol, formulaRichResults);
  const formulaSources = container.resolve<FormulaSourceProviderRegistry>(FormulaSourceProviderRegistry.symbol);
  container.register(FormulaResultStore.symbol, FormulaResultStore, Scope.Singleton);
  container.register(FormulaCalculationTraceBus.symbol, FormulaCalculationTraceBus, Scope.Singleton);
  const formulaCalculationTrace = container.resolve<FormulaCalculationTraceBus>(FormulaCalculationTraceBus.symbol);
  container.registerInstance(IFormulaCalculationTraceProvider.symbol, formulaCalculationTrace);
  container.register(FormulaRenderInvalidator.symbol, FormulaRenderInvalidator, Scope.Singleton);
  container.register(FormulaSchedulerDataSource.symbol, SheetFormulaSchedulerDataSource, Scope.Singleton);
  container.register(FormulaRefShifter.symbol, FormulaRefShifter, Scope.Singleton);
  container.register(RecalcScheduler.symbol, RecalcScheduler, Scope.Singleton);
  container.register(SheetFormulaPlugin.symbol, SheetFormulaPlugin, Scope.Singleton);
  const formulaPlugin = container.resolve<SheetFormulaPlugin>(SheetFormulaPlugin.symbol);
  container.registerInstance(IFormulaStatusProvider.symbol, formulaPlugin);
  formulaResults.register({ provider: formulaPlugin });
  formulaRichResults.register({ provider: formulaPlugin });
  formulaSources.register({ provider: formulaPlugin });
  manager.registerPlugin(formulaPlugin);
  registerBuiltinCellDefinitions(container.resolve(CellTypeCatalog.symbol));
}
