import { Container, Scope } from '@searsuite/sear-foundation-di';
import {
  EditorLifecycleStack,
  SessionStateRestorePhase,
  createRuntimeCapabilityReader,
} from '@searsuite/sear-assembly-plugin';
import {
  SheetCommandBus,
  SheetCommandEffectRegistry,
  SheetRuntimeCapability,
  type SheetPlugin,
  type SheetPluginSetupContext,
  type SheetPluginRuntimeContext,
  type SheetEditor,
} from '@searsuite/sear-assembly-commands';
import {
  IFormulaDateSystemProvider,
  IFunctionRegistry,
  IFormulaExternalServiceProvider,
  FormulaDateSystem,
} from '@searsuite/sear-domain-formula-engine';
import { FormulaExternalServiceRegistry } from '@searsuite/sear-domain-formula-engine-ts';
import { SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import { RecalcScheduler } from '@searsuite/sear-plugin-formula';
import { cloneSheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { registerSheetBaseServices } from './registerSheetBaseServices';
import { registerSheetRuntimeServices } from './registerSheetRuntimeServices';
import { registerDefaultSheetFeatures } from './registerDefaultSheetFeatures';
import { createSheetPluginSetupRuntime } from './createSheetPluginSetupRuntime';
import { registerSheetKernelContributions, bindSheetKernelCommands } from './SheetKernelContributions';
import { sealSheetKernelRuntime } from './sealSheetKernelRuntime';
import { type SheetKernelConfiguration } from './SheetKernelContracts';
import { SheetKernel } from './SheetKernel';

/** Creates an isolated Sheet business editor with no presentation adapters or scene. */
export function createSheetKernelEditor(options: SheetKernelConfiguration): SheetEditor {
  const container = new Container(),
    lifecycle = new EditorLifecycleStack();
  lifecycle.add(() => container.reset());
  try {
    return assembleSheetKernelEditor(container, lifecycle, options);
  } catch (error) {
    try {
      lifecycle.dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Sheet kernel setup and cleanup both failed.');
    }
    throw error;
  }
}

function assembleSheetKernelEditor(
  container: Container,
  lifecycle: EditorLifecycleStack,
  options: SheetKernelConfiguration,
): SheetEditor {
  const { adapters } = options;
  const base = registerSheetBaseServices(container, adapters, {
    ...(options.cellFontSize === undefined ? {} : { sheetCellFontSize: options.cellFontSize }),
    ...(options.cellFontFamily === undefined ? {} : { sheetCellFontFamily: options.cellFontFamily }),
  });
  adapters.registerEnvironment?.(container);
  if (!container.hasBinding(IFormulaDateSystemProvider.symbol))
    container.registerInstance(IFormulaDateSystemProvider.symbol, { getDateSystem: () => FormulaDateSystem.Excel1900 });
  if (adapters.createFunctionRegistry && !container.hasBinding(IFunctionRegistry.symbol))
    container.registerFactory(IFunctionRegistry.symbol, adapters.createFunctionRegistry, Scope.Singleton);
  const setupServices = { container };
  for (const implementation of options.plugins ?? []) {
    container.register(implementation.symbol, implementation, Scope.Singleton);
    implementation.registerServices?.(setupServices);
  }
  const { pluginManager } = registerSheetRuntimeServices(container, adapters),
    ownsExternalServices = !container.hasBinding(IFormulaExternalServiceProvider.symbol);
  registerDefaultSheetFeatures(container, pluginManager, adapters, cloneSheetDocumentState(options.sheetState));
  if (ownsExternalServices) {
    const services = container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol),
      token = {};
    FormulaExternalServiceRegistry.prototype.enforceTeardownBoundary.call(services, token);
    lifecycle.add(() => services.destroy(token));
  }
  const customPlugins = (options.plugins ?? []).map((implementation) => {
    const plugin = container.resolve<SheetPlugin<unknown>>(implementation.symbol);
    pluginManager.registerPlugin(plugin);
    return plugin;
  });
  const runtime = createSheetPluginSetupRuntime({ container, ...base, pluginManager });
  const setupContext: SheetPluginSetupContext = { container, runtime };
  const commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol),
    kernel = container.resolve<SheetKernel>(SheetKernel.symbol);
  registerSheetKernelContributions(container, runtime, options);
  runtime.session.restorePhase(SessionStateRestorePhase.BeforeInitialize);
  customPlugins.forEach((plugin) => plugin.configure?.(setupContext));
  bindSheetKernelCommands(container, kernel, runtime);
  kernel.enforceCommandBoundary(commands.isExecuting.bind(commands));
  const sessionToken = {},
    kernelToken = {},
    schedulerToken = {};
  lifecycle.add(() => runtime.session.clear(sessionToken));
  lifecycle.add(() => runtime.extensions.destroy());
  lifecycle.add(() => kernel.destroy(kernelToken));
  lifecycle.add(() => commands.destroy());
  const scheduler = container.resolve<RecalcScheduler>(RecalcScheduler.symbol);
  scheduler.bindTeardownToken(schedulerToken);
  lifecycle.add(() => scheduler.dispose(schedulerToken));
  lifecycle.add(() => runtime.queries.destroy());
  lifecycle.add(() => runtime.observations.destroy());
  lifecycle.add(() => container.resolve<SheetCellStyleRegistry>(SheetCellStyleRegistry.symbol).destroy());
  lifecycle.add(() => container.resolve<SheetCommandEffectRegistry>(SheetCommandEffectRegistry.symbol).destroy());
  const context: SheetPluginRuntimeContext = { container, runtime: { ...runtime, commands } };
  lifecycle.add(() => {
    for (const plugin of [...pluginManager.getAllPlugins()].reverse())
      (plugin as SheetPlugin<unknown>).onEditorDestroy?.(context);
  });
  kernel.initialize();
  runtime.session.restorePhase(SessionStateRestorePhase.AfterInitialize);
  runtime.session.sealRestoration(sessionToken);
  customPlugins.forEach((plugin) => plugin.initialize?.(context));
  kernel.start();
  customPlugins.forEach((plugin) => plugin.start?.(context));
  kernel.enforceTeardownBoundary(kernelToken);
  const assertWrite = sealSheetKernelRuntime(container, runtime, lifecycle);
  let destroyed = false;
  const editor: SheetEditor = {
    commands,
    queries: runtime.queries,
    observations: runtime.observations,
    services: createRuntimeCapabilityReader(runtime.extensions, [
      SheetRuntimeCapability.Plugins,
      SheetRuntimeCapability.Data,
      SheetRuntimeCapability.Session,
      SheetRuntimeCapability.Interaction,
    ]),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      lifecycle.dispose();
    },
  };
  options.onCreated?.(editor);
  commands.enforceRegistrationBoundary(assertWrite);
  return editor;
}
