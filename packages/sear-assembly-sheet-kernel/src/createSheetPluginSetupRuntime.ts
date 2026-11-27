import { SheetCellStyleRegistry, type SheetCellStyleReader } from '@searsuite/sear-domain-cell-types';
import { SheetRuntimeCapability } from '@searsuite/sear-assembly-commands';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';
import { IFormulaTextServiceProvider } from '@searsuite/sear-domain-formula-engine';
import { IFormulaExternalServiceProvider } from '@searsuite/sear-domain-formula-engine';

import {
  PipelineStepExecutorRegistry,
  SheetInteractionReducerRegistry,
  SheetInteractionStore,
} from '@searsuite/sear-assembly-plugin';
import { SessionStateRegistry, type PluginManager } from '@searsuite/sear-assembly-plugin';
import { CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { type Container } from '@searsuite/sear-foundation-di';
import { Platform, WebServiceClient, XmlXPathEvaluator } from '@searsuite/sear-foundation-platform';

import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';

import { SheetDataEngine } from '@searsuite/sear-domain-sheet';

import {
  FormulaResultProviderRegistry,
  FormulaRichResultProviderRegistry,
  FormulaSourceProviderRegistry,
} from '@searsuite/sear-plugin-formula';
import { SheetRuntimeExtensionRegistry } from '@searsuite/sear-assembly-commands';
/** Business services supplied to an editor-local Plugin registration phase. */
export interface SheetPluginRuntimeOptions {
  readonly container: Container;
  readonly configEngine: ConfigEngine;
  readonly dataEngine: SheetDataEngine;
  readonly pluginManager: PluginManager;
}
/** Creates the neutral state, command, query and observation setup runtime. */
export function createSheetPluginSetupRuntime(options: SheetPluginRuntimeOptions) {
  const { container } = options;
  const styleRegistry = container.resolve<SheetCellStyleRegistry>(SheetCellStyleRegistry.symbol);
  const styles: SheetCellStyleReader = Object.freeze({
    read: (row: number, column: number) => styleRegistry.read(row, column),
  });
  const extensions = new SheetRuntimeExtensionRegistry();
  extensions.register(SheetRuntimeCapability.Styles, styles);
  const cells = {
    catalog: container.resolve<CellTypeCatalog>(CellTypeCatalog.symbol),
  };
  const formula = {
    functions: container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol),
    textServices: container.resolve<IFormulaTextServiceProvider>(IFormulaTextServiceProvider.symbol),
    externalServices: container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol),
    results: container.resolve<FormulaResultProviderRegistry>(FormulaResultProviderRegistry.symbol),
    richResults: container.resolve<FormulaRichResultProviderRegistry>(FormulaRichResultProviderRegistry.symbol),
    sources: container.resolve<FormulaSourceProviderRegistry>(FormulaSourceProviderRegistry.symbol),
    xmlXPath: container.resolve<XmlXPathEvaluator>(XmlXPathEvaluator.symbol),
    webService: container.resolve<WebServiceClient>(WebServiceClient.symbol),
  };
  const interaction = {
    store: container.resolve<SheetInteractionStore>(SheetInteractionStore.symbol),
    reducers: container.resolve<SheetInteractionReducerRegistry>(SheetInteractionReducerRegistry.symbol),
    pipelineSteps: container.resolve<PipelineStepExecutorRegistry>(PipelineStepExecutorRegistry.symbol),
  };
  extensions.register(SheetRuntimeCapability.Platform, container.resolve<Platform>(Platform.symbol));
  extensions.register(SheetRuntimeCapability.Config, options.configEngine);
  extensions.register(
    SheetRuntimeCapability.Observations,
    container.resolve<ObservationRegistry>(ObservationRegistry.symbol),
  );
  extensions.register(SheetRuntimeCapability.Queries, container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol));
  extensions.register(
    SheetRuntimeCapability.Session,
    container.resolve<SessionStateRegistry>(SessionStateRegistry.symbol),
  );
  extensions.register(SheetRuntimeCapability.Plugins, options.pluginManager);
  extensions.register(SheetRuntimeCapability.Data, options.dataEngine);
  extensions.register(SheetRuntimeCapability.Cells, cells);
  extensions.register(SheetRuntimeCapability.Formula, formula);
  extensions.register(SheetRuntimeCapability.Interaction, interaction);
  return {
    extensions,
    styles,
    cells,
    formula,
    interaction,
    platform: extensions.require(SheetRuntimeCapability.Platform),
    config: extensions.require(SheetRuntimeCapability.Config),
    observations: extensions.require(SheetRuntimeCapability.Observations),
    queries: extensions.require(SheetRuntimeCapability.Queries),
    session: extensions.require(SheetRuntimeCapability.Session),
    plugins: options.pluginManager,
    data: options.dataEngine,
  };
}
