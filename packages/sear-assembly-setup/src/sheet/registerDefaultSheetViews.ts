import { SheetDataValidationView } from '@searsuite/sear-render';
import { registerSheetFilterVisuals } from '@searsuite/sear-render';

import { createBuiltinSheetCellView, SheetCellBorderView } from '@searsuite/sear-render';
import { SheetRenderCoordinatorManager } from '@searsuite/sear-render-registry';
import { ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';
import { registerSheetDropdownView } from './runtimePlugin/dropdown/registerSheetDropdownView';
import { registerSheetCheckboxView } from './runtimePlugin/checkbox/registerSheetCheckboxView';

import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';

import { CellTypeCatalog } from '@searsuite/sear-domain-cell';

import { CommitCellEditCommand, IsCellEditingQuery } from '@searsuite/sear-plugin-cell-editor';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';

import { type Container } from '@searsuite/sear-foundation-di';
import { CoordinateEngine } from '@searsuite/sear-render-coord';

import { SheetDataValidationPlugin } from '@searsuite/sear-plugin-data-validation';

import { SheetFilterPlugin } from '@searsuite/sear-plugin-filter';

import { type CellProperties } from '@searsuite/sear-render-registry';

import { type SheetEditorAdapters } from './SheetEditorContracts';

import { registerSheetInteractionViews } from './runtimePlugin/interaction/registerSheetInteractionViews';
import { registerSheetInteractionDecorationViews } from './runtimePlugin/postFormulaInteraction/registerSheetInteractionDecorationViews';
import { registerSheetViews } from './runtimePlugin/render/registerSheetViews';

import { SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import { registerSheetClipboardViewBindings } from './runtimePlugin/clipboard/registerSheetClipboardViewBindings';
/** Attaches the selected built-in presentations to existing business state owners. */
export function registerDefaultSheetViews(container: Container, adapters: SheetEditorAdapters): void {
  const views = container.resolve<ViewExtensionRegistry<SearCoreSheet, CellProperties>>(ViewExtensionRegistry.symbol);
  const validationPlugin = container.resolve<SheetDataValidationPlugin>(SheetDataValidationPlugin.symbol);
  const filterPlugin = container.resolve<SheetFilterPlugin>(SheetFilterPlugin.symbol);
  views.register(
    new SheetDataValidationView({
      source: validationPlugin,
      registry: container.resolve<SheetCellVisualReaderRegistry>(SheetCellVisualReaderRegistry.symbol),
      commands: container.resolve<SheetCommandBus>(SheetCommandBus.symbol),
      coordinates: container.resolve<CoordinateEngine>(CoordinateEngine.symbol),
      beforeChange: () => {
        const queries = container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol);
        if (!queries.has(IsCellEditingQuery) || !queries.run(IsCellEditingQuery, undefined)) return true;
        container.resolve<SheetCommandBus>(SheetCommandBus.symbol).run(CommitCellEditCommand, undefined);
        return !queries.run(IsCellEditingQuery, undefined);
      },
    }),
  );
  views.register(new SheetCellBorderView());
  views.register(container.resolve<CoordinateEngine>(CoordinateEngine.symbol));
  registerSheetViews(container);
  registerSheetInteractionViews(container, adapters);
  registerSheetClipboardViewBindings(container);
  views.register(
    createBuiltinSheetCellView(
      container.resolve<SheetRenderCoordinatorManager>(SheetRenderCoordinatorManager.symbol),
      container.resolve<CellTypeCatalog>(CellTypeCatalog.symbol),
    ),
  );
  registerSheetFilterVisuals(
    container.resolve<SheetCellVisualReaderRegistry>(SheetCellVisualReaderRegistry.symbol),
    filterPlugin,
  );
  registerSheetInteractionDecorationViews(container);
  registerSheetCheckboxView(container);
  registerSheetDropdownView(container);
}
