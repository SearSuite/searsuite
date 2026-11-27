import { createDocDocumentFormatting } from '@searsuite/sear-assembly-doc';

import { CellCommitStrategyRegistry, ICellFormatLocaleProvider } from '@searsuite/sear-domain-cell-types';

import { IFormulaDateSystemProvider } from '@searsuite/sear-domain-formula-engine';

import { DataEngine } from '@searsuite/sear-domain-state';

import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';

import { SheetQueryRegistry } from '@searsuite/sear-assembly-commands';

import { Platform } from '@searsuite/sear-foundation-platform';

import {
  SheetRangeMoveRegistry,
  SheetFormatTransferRegistry,
  SheetClipboardTransferRegistry,
  SheetInteractionReducerRegistry,
} from '@searsuite/sear-assembly-plugin';

import { CellClipboardCodecRegistry, SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';

import { type PluginManager } from '@searsuite/sear-assembly-plugin';

import { CellTypeCatalog } from '@searsuite/sear-domain-cell';

import { IFormulaParser, IFormulaSourceProvider } from '@searsuite/sear-domain-formula-engine';

import { FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';

import { type Container, Scope } from '@searsuite/sear-foundation-di';

import { SheetCellEditorPlugin } from '@searsuite/sear-plugin-cell-editor';

import { FormulaSourceProviderRegistry } from '@searsuite/sear-plugin-formula';

import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';

/** Registers selection and document editing without native input or drawing services. */
export function registerSheetEditingFeatures(container: Container, manager: PluginManager): void {
  container.registerFactory(
    SheetSelectionPlugin.symbol,
    () =>
      new SheetSelectionPlugin({
        data: container.resolve<DataEngine>(DataEngine.symbol),
        queries: container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol),
        merges: container.resolve<SheetCellMergePlugin>(SheetCellMergePlugin.symbol),
        rangeMoves: container.resolve<SheetRangeMoveRegistry>(SheetRangeMoveRegistry.symbol),
        validation: container.resolve<SheetCellInputValidationRegistry>(SheetCellInputValidationRegistry.symbol),
        codecs: container.resolve<CellClipboardCodecRegistry>(CellClipboardCodecRegistry.symbol),
        formats: container.resolve<SheetFormatTransferRegistry>(SheetFormatTransferRegistry.symbol),
        ownerData: container.resolve<SheetClipboardTransferRegistry>(SheetClipboardTransferRegistry.symbol),
        interactionReducers: container.resolve<SheetInteractionReducerRegistry>(SheetInteractionReducerRegistry.symbol),
        platform: container.resolve<Platform>(Platform.symbol),
      }),
    Scope.Singleton,
  );
  container.register(IFormulaParser.symbol, FormulaParser, Scope.Singleton);
  container.register(FormulaSourceProviderRegistry.symbol, FormulaSourceProviderRegistry, Scope.Singleton);
  const formulaSources = container.resolve<FormulaSourceProviderRegistry>(FormulaSourceProviderRegistry.symbol);
  container.registerInstance(IFormulaSourceProvider.symbol, formulaSources);

  CellTypeCatalog.install(container);
  container.registerFactory(
    SheetCellEditorPlugin.symbol,
    () =>
      new SheetCellEditorPlugin({
        data: container.resolve<DataEngine>(DataEngine.symbol),
        merges: container.resolve<SheetCellMergePlugin>(SheetCellMergePlugin.symbol),
        selection: container.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol),
        platform: container.resolve<Platform>(Platform.symbol),
        commitStrategies: container.resolve<CellCommitStrategyRegistry>(CellCommitStrategyRegistry.symbol),
        interactionReducers: container.resolve<SheetInteractionReducerRegistry>(SheetInteractionReducerRegistry.symbol),
        queries: container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol),
        formulaSourceProvider: container.resolve<IFormulaSourceProvider>(IFormulaSourceProvider.symbol),
        formulaParser: container.resolve<IFormulaParser>(IFormulaParser.symbol),
        cellFormatLocaleProvider: container.resolve<ICellFormatLocaleProvider>(ICellFormatLocaleProvider.symbol),
        inputValidation: container.resolve<SheetCellInputValidationRegistry>(SheetCellInputValidationRegistry.symbol),
        dateSystemProvider: container.resolve<IFormulaDateSystemProvider>(IFormulaDateSystemProvider.symbol),
        cellCodecs: container.resolve<CellClipboardCodecRegistry>(CellClipboardCodecRegistry.symbol),
        formatting: createDocDocumentFormatting(),
      }),
    Scope.Singleton,
  );
  const cellEditor = container.resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol);
  manager.registerPlugin(cellEditor);
}
