import { type Container } from '@searsuite/sear-foundation-di';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { SheetCheckboxPlugin, CheckboxCellType } from '@searsuite/sear-plugin-checkbox';
import { CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { SheetDataPlugin } from '@searsuite/sear-render-engine';
import { CellFormulaValueConverterRegistry } from '@searsuite/sear-plugin-formula';
import { ReadDataValidationCellRulesQuery, DataValidationKind } from '@searsuite/sear-plugin-data-validation';
import { SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { CommitCellEditCommand, IsCellEditingQuery } from '@searsuite/sear-plugin-cell-editor';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { CursorRegistry, CursorRuleKind, CursorRulePriority, CursorToken } from '@searsuite/sear-render-cursor';
/** Installs checkbox capabilities through the cell catalog and editor-local extension registries. */
export function registerSheetCheckboxPlugin(
  container: Container,
  manager: PluginManager<SearCoreSheet, CellProperties>,
): void {
  const data = container.resolve<SheetDataPlugin>(SheetDataPlugin.symbol),
    commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol),
    queries = container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol),
    validation = container.resolve<SheetCellInputValidationRegistry>(SheetCellInputValidationRegistry.symbol);
  const plugin = new SheetCheckboxPlugin({
    cursor: container.resolve<CursorRegistry>(CursorRegistry.symbol),
    catalog: container.resolve<CellTypeCatalog>(CellTypeCatalog.symbol),
    formulas: container.resolve<CellFormulaValueConverterRegistry>(CellFormulaValueConverterRegistry.symbol),
    inputValidation: validation,
    readShape: () => [...data.getState().sheetData.shape] as [number, number],
    readCell: (r, c) => data.getState().sheetData.getItem(r, c),
    isMergedCoveredCell: (row, column) => {
      const anchor = container
        .resolve<SheetCellMergePlugin>(SheetCellMergePlugin.symbol)
        .isMergedCell(row, column)
        ?.getPoint(0);
      return !!anchor && (anchor[0] !== row || anchor[1] !== column);
    },
    forEachStored: (range, visit) =>
      data
        .getState()
        .sheetData.forEachStoredInRange(range.anchor[0], range.anchor[1], range.focus[0], range.focus[1], visit),
    createTransaction: (writes) =>
      createTransaction(
        SheetDataPlugin.pluginKey,
        writes.map(({ row, column, cell }) =>
          createUpdateCellOTOperation([row, column], cell, data.getState().sheetData.getItem(row, column)),
        ),
      ),
    hasCheckboxRule: (row, column) =>
      queries.has(ReadDataValidationCellRulesQuery) &&
      queries
        .run(ReadDataValidationCellRulesQuery, [row, column])
        .some(({ rule }) => rule.condition.kind === DataValidationKind.Checkbox),
    validateValue: (row, column, text) => validation.validate(row, column, text),
    beforeToggle: () => {
      if (queries.has(IsCellEditingQuery) && queries.run(IsCellEditingQuery, undefined)) {
        commands.run(CommitCellEditCommand, undefined);
        return !queries.run(IsCellEditingQuery, undefined);
      }
      return true;
    },
  });
  container.registerInstance(SheetCheckboxPlugin.symbol, plugin);
  manager.registerPlugin(plugin);
}
