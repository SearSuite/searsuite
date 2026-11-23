import { SheetRangeDrag } from '@searsuite/sear-plugin-selection';
import { UserInteractionService } from '@searsuite/sear-foundation-user-interaction';
import { SheetLifecycleCoordinator, type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { IFormulaParser, IFormulaSourceProvider } from '@searsuite/sear-domain-formula-engine';
import { FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import {
  FormulaReferenceHighlighter,
  FormulaReferencePickService,
  Highlighter,
  SheetCellEditorPlugin,
} from '@searsuite/sear-plugin-cell-editor';
import { FormulaSourceProviderRegistry } from '@searsuite/sear-plugin-formula';
import { SheetHighlightRegistry, SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
import { CursorEngine, CursorRegistry } from '@searsuite/sear-render-cursor';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { type SheetEditorAdapters } from '../../SheetEditorContracts';
import { SheetInputAdapterLifecycle } from '../../SheetInputAdapterLifecycle';

/** Registers input, cursor, selection, and editor services that depend on host adapters. */
export function registerSheetInteractionPlugins(
  container: Container,
  manager: PluginManager<SearCoreSheet, CellProperties>,
  adapters: SheetEditorAdapters,
): void {
  container.register(TextInput.symbol, adapters.textInput, Scope.Singleton);
  container.register(KeyboardRouter.symbol, adapters.keyboardRouter, Scope.Singleton);
  container.register(PointerCapture.symbol, adapters.pointerCapture, Scope.Singleton);
  container.register(SheetInputAdapterLifecycle.symbol, SheetInputAdapterLifecycle, Scope.Singleton);
  container
    .resolve<SheetLifecycleCoordinator>(SheetLifecycleCoordinator.symbol)
    .register(container.resolve<SheetInputAdapterLifecycle>(SheetInputAdapterLifecycle.symbol));
  container.register(SheetSelectionPlugin.symbol, SheetSelectionPlugin, Scope.Singleton);
  container.register(SheetRangeDrag.symbol, SheetRangeDrag, Scope.Singleton);
  container.register(CursorRegistry.symbol, CursorRegistry, Scope.Singleton);
  container.register(CursorEngine.symbol, adapters.cursorEngine, Scope.Singleton);
  container.register(IFormulaParser.symbol, FormulaParser, Scope.Singleton);
  container.register(FormulaSourceProviderRegistry.symbol, FormulaSourceProviderRegistry, Scope.Singleton);
  const formulaSources = container.resolve<FormulaSourceProviderRegistry>(FormulaSourceProviderRegistry.symbol);
  container.registerInstance(IFormulaSourceProvider.symbol, formulaSources);
  container.register(SheetHighlightRegistry.symbol, SheetHighlightRegistry, Scope.Singleton);
  CellTypeCatalog.install(container);
  container
    .resolve<SheetRangeDrag>(SheetRangeDrag.symbol)
    .setUserInteraction(
      container.hasBinding(UserInteractionService.symbol)
        ? container.resolve<UserInteractionService>(UserInteractionService.symbol)
        : undefined,
    );
  container.register(Highlighter.symbol, FormulaReferenceHighlighter, Scope.Singleton);
  SheetCellEditorPlugin.registerServices({ container });
  container.register(SheetCellEditorPlugin.symbol, SheetCellEditorPlugin, Scope.Singleton);
  const cellEditor = container.resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol);
  if (container.hasBinding(FormulaReferencePickService.symbol)) {
    cellEditor.bindReferencePickService(
      container.resolve<FormulaReferencePickService>(FormulaReferencePickService.symbol),
    );
  }
  manager.registerPlugin(cellEditor);
}
