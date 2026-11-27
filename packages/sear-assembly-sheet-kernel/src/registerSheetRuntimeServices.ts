import { SheetCommandEffectRegistry } from '@searsuite/sear-assembly-commands';
import { SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import {
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  SheetStructureMoveRegistry,
} from '@searsuite/sear-assembly-plugin';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { createDefaultCellFormatLocaleProvider, ICellFormatLocaleProvider } from '@searsuite/sear-domain-cell-types';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { FileDownload, UnavailableFileDownload, Platform } from '@searsuite/sear-foundation-platform';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { PluginManager } from '@searsuite/sear-assembly-plugin';

import { UserInteractionService } from '@searsuite/sear-foundation-user-interaction';
import { type SheetRuntimeAdapters } from './SheetKernelContracts';
import {
  InMemorySheetClipboard,
  SheetClipboard,
  SheetClipboardCutSession,
  SheetClipboardSheetIdentity,
} from '@searsuite/sear-plugin-clipboard';
import { NoopSheetExternalHistory, SheetExternalHistory } from '@searsuite/sear-plugin-history';

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
  if (!container.hasBinding(SheetExternalHistory.symbol))
    container.registerInstance(SheetExternalHistory.symbol, new NoopSheetExternalHistory());
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
