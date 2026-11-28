import { SheetCommandBus, SheetCommandEffectRegistry, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import {
  PluginManager,
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  SheetStructureMoveRegistry,
} from '@searsuite/sear-assembly-plugin';
import {
  createDefaultCellFormatLocaleProvider,
  ICellFormatLocaleProvider,
  SheetCellStyleRegistry,
} from '@searsuite/sear-domain-cell-types';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { FileDownload, Platform, UnavailableFileDownload } from '@searsuite/sear-foundation-platform';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';

import { UserInteractionService } from '@searsuite/sear-foundation-user-interaction';
import {
  InMemorySheetClipboard,
  SheetClipboard,
  SheetClipboardCutSession,
  SheetClipboardSheetIdentity,
} from '@searsuite/sear-plugin-clipboard';
import { type SheetRuntimeAdapters } from './SheetKernelContracts';

/** Registers command, query, clipboard and state-owner runtime services. */
export function registerSheetRuntimeServices(container: Container, adapters: SheetRuntimeAdapters) {
  if (!container.hasBinding(ICellFormatLocaleProvider.symbol)) {
    container.registerInstance(ICellFormatLocaleProvider.symbol, createDefaultCellFormatLocaleProvider());
  }
  container.register(SheetCellStyleRegistry.symbol, SheetCellStyleRegistry, Scope.Singleton);
  container.register(SheetRangeMoveRegistry.symbol, SheetRangeMoveRegistry, Scope.Singleton);
  container.register(SheetRangeReorderRegistry.symbol, SheetRangeReorderRegistry, Scope.Singleton);
  container.register(SheetStructureMoveRegistry.symbol, SheetStructureMoveRegistry, Scope.Singleton);
  container.register(SheetCommandEffectRegistry.symbol, SheetCommandEffectRegistry, Scope.Singleton);
  container.register(SheetCommandBus.symbol, SheetCommandBus, Scope.Singleton);
  if (!container.hasBinding(FileDownload.symbol)) {
    container.register(FileDownload.symbol, adapters.fileDownload ?? UnavailableFileDownload, Scope.Singleton);
  }
  if (adapters.userInteraction)
    container.register(UserInteractionService.symbol, adapters.userInteraction, Scope.Singleton);
  container.register(SheetClipboard.symbol, adapters.clipboard ?? InMemorySheetClipboard, Scope.Singleton);
  if (!container.hasBinding(SheetClipboardCutSession.symbol))
    container.registerInstance(SheetClipboardCutSession.symbol, new SheetClipboardCutSession());
  if (!container.hasBinding(SheetClipboardSheetIdentity.symbol))
    container.registerInstance(
      SheetClipboardSheetIdentity.symbol,
      new SheetClipboardSheetIdentity(container.resolve<Platform>(Platform.symbol).createId('sheet-clipboard-source')),
    );
  container.register(SheetQueryRegistry.symbol, SheetQueryRegistry, Scope.Singleton);
  container.register(ObservationRegistry.symbol, ObservationRegistry, Scope.Singleton);
  container.registerFactory(
    PluginManager.symbol,
    () => new PluginManager(container.resolve<Platform>(Platform.symbol)),
    Scope.Singleton,
  );
  const pluginManager = container.resolve<PluginManager>(PluginManager.symbol);
  return { pluginManager };
}
