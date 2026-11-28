import {
  SheetCommandBus,
  SheetCommandEffectRegistry,
  SheetRuntimeCapability,
  type SheetEditor,
  type SheetPlugin,
  type SheetPluginRuntimeContext,
  type SheetPluginSetupContext,
} from '@searsuite/sear-assembly-commands';
import {
  EditorLifecycleStack,
  SessionStateRestorePhase,
  createRuntimeCapabilityReader,
} from '@searsuite/sear-assembly-plugin';
import { cloneSheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import {
  FormulaDateSystem,
  IFormulaDateSystemProvider,
  IFormulaExternalServiceProvider,
  IFunctionRegistry,
} from '@searsuite/sear-domain-formula-engine';
import { FormulaExternalServiceRegistry } from '@searsuite/sear-domain-formula-engine-ts';
import { Container, Scope } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { RecalcScheduler } from '@searsuite/sear-plugin-formula';
import { createSheetPluginSetupRuntime } from './createSheetPluginSetupRuntime';
import { registerDefaultSheetFeatures } from './registerDefaultSheetFeatures';
import { registerSheetBaseServices } from './registerSheetBaseServices';
import { registerSheetRuntimeServices } from './registerSheetRuntimeServices';
import { sealSheetKernelRuntime } from './sealSheetKernelRuntime';
import { SheetKernel } from './SheetKernel';
import { type SheetKernelConfiguration } from './SheetKernelContracts';
import { bindSheetKernelCommands, registerSheetKernelContributions } from './SheetKernelContributions';

/** Prepares one business runtime shared by Headless and visual Sheet hosts. */
export function prepareSheetKernel(
  container: Container,
  lifecycle: EditorLifecycleStack,
  options: SheetKernelConfiguration,
) {
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
  let initialized = false,
    started = false;
  let assertWrite: (() => void) | undefined;
  return {
    ...base,
    kernel,
    runtime,
    editor,
    initialize(attachPresentation?: () => void): void {
      if (initialized) return;
      initialized = true;
      runtime.session.restorePhase(SessionStateRestorePhase.BeforeInitialize);
      customPlugins.forEach((plugin) => plugin.configure?.(setupContext));
      bindSheetKernelCommands(container, kernel, runtime);
      kernel.initialize();
      attachPresentation?.();
      runtime.session.restorePhase(SessionStateRestorePhase.AfterInitialize);
      runtime.session.sealRestoration(sessionToken);
      customPlugins.forEach((plugin) => plugin.initialize?.(context));
    },
    start(): void {
      if (started) return;
      started = true;
      kernel.start();
      customPlugins.forEach((plugin) => plugin.start?.(context));
    },
    seal(): () => void {
      if (!assertWrite) {
        kernel.enforceTeardownBoundary(kernelToken);
        assertWrite = sealSheetKernelRuntime(container, runtime, lifecycle);
      }
      return assertWrite;
    },
    sealCommands(): void {
      if (!assertWrite) throw new SearError('Seal the Sheet runtime before command registration.');
      SheetCommandBus.prototype.enforceRegistrationBoundary.call(commands, assertWrite);
    },
  };
}
