import { SheetCellEditorView, SheetSelectionView } from '@searsuite/sear-render';

import { TextShaper } from '@searsuite/sear-render-metrics';

import { CoordinateTransformer } from '@searsuite/sear-render-context';

import { SheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';

import { SheetCommandBus } from '@searsuite/sear-assembly-commands';

import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';

import { Platform } from '@searsuite/sear-foundation-platform';

import { ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';

import { SheetRangeDrag } from '@searsuite/sear-render';

import { UserInteractionService } from '@searsuite/sear-foundation-user-interaction';

import { SheetLifecycleCoordinator, type SearCoreSheet } from '@searsuite/sear-assembly-core';

import { type Container, Scope } from '@searsuite/sear-foundation-di';

import { FormulaReferencePickService, SheetCellEditorPlugin } from '@searsuite/sear-plugin-cell-editor';

import { FormulaReferenceHighlighter, Highlighter } from '@searsuite/sear-render';

import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';

import { SheetHighlightRegistry } from '@searsuite/sear-render';

import { CursorEngine, CursorRegistry } from '@searsuite/sear-render-cursor';

import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';

import { type CellProperties } from '@searsuite/sear-render-registry';

import { type SheetEditorAdapters } from '../../SheetEditorContracts';

import { SheetInputAdapterLifecycle } from '../../SheetInputAdapterLifecycle';
/** Registers native input adapters and the editing view for an assembled business kernel. */
export function registerSheetInteractionViews(container: Container, adapters: SheetEditorAdapters): void {
  container.register(TextInput.symbol, adapters.textInput, Scope.Singleton);
  container.register(KeyboardRouter.symbol, adapters.keyboardRouter, Scope.Singleton);
  container.register(PointerCapture.symbol, adapters.pointerCapture, Scope.Singleton);
  container.register(SheetInputAdapterLifecycle.symbol, SheetInputAdapterLifecycle, Scope.Singleton);
  container
    .resolve<SheetLifecycleCoordinator>(SheetLifecycleCoordinator.symbol)
    .register(container.resolve<SheetInputAdapterLifecycle>(SheetInputAdapterLifecycle.symbol));

  container.register(SheetRangeDrag.symbol, SheetRangeDrag, Scope.Singleton);
  container.register(CursorRegistry.symbol, CursorRegistry, Scope.Singleton);
  container.register(CursorEngine.symbol, adapters.cursorEngine, Scope.Singleton);
  container.register(SheetHighlightRegistry.symbol, SheetHighlightRegistry, Scope.Singleton);
  container
    .resolve<SheetRangeDrag>(SheetRangeDrag.symbol)
    .setUserInteraction(
      container.hasBinding(UserInteractionService.symbol)
        ? container.resolve<UserInteractionService>(UserInteractionService.symbol)
        : undefined,
    );
  container.register(Highlighter.symbol, FormulaReferenceHighlighter, Scope.Singleton);
  const cellEditor = container.resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol);
  const view = new SheetCellEditorView(cellEditor, {
    merges: container.resolve<SheetCellMergePlugin>(SheetCellMergePlugin.symbol),
    selection: container.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol),
    onFillHandleDoubleClick: (event) =>
      container.resolve<SheetSelectionView>(SheetSelectionView.symbol).onFillHandleDoubleClick(event),
    textInput: container.resolve<TextInput>(TextInput.symbol),
    keyboard: container.resolve<KeyboardRouter>(KeyboardRouter.symbol),
    pointer: container.resolve<PointerCapture>(PointerCapture.symbol),
    cursors: container.resolve<CursorRegistry>(CursorRegistry.symbol),
    cursor: container.resolve<CursorEngine>(CursorEngine.symbol),
    platform: container.resolve<Platform>(Platform.symbol),
    highlighter: container.resolve<Highlighter>(Highlighter.symbol),
    coordinates: container.resolve<CoordinateTransformer>(CoordinateTransformer.symbol),
    embeddedEditor: container.resolve<SheetEmbeddedEditor>(SheetEmbeddedEditor.symbol),
    textShaper: container.resolve<TextShaper>(TextShaper.symbol),
    commands: container.resolve<SheetCommandBus>(SheetCommandBus.symbol),
    references: container.hasBinding(FormulaReferencePickService.symbol)
      ? container.resolve<FormulaReferencePickService>(FormulaReferencePickService.symbol)
      : undefined,
  });
  container.registerInstance(SheetCellEditorView.symbol, view);
  container.resolve<ViewExtensionRegistry<SearCoreSheet, CellProperties>>(ViewExtensionRegistry.symbol).register(view);
}
