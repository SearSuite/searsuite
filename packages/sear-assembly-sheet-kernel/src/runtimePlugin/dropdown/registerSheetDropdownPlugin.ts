import { type Container } from '@searsuite/sear-foundation-di';
import { type PluginManager } from '@searsuite/sear-assembly-plugin';

import { SheetDropdownPlugin } from '@searsuite/sear-plugin-dropdown';
import { SheetQueryRegistry, SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { SheetCellInputValidationRegistry, CellType } from '@searsuite/sear-domain-cell-types';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';

/** Source projection shared with sparse conditional range consumers. */
export interface DropdownSourceProjection {
  /** Reads current values, including formulas. */ readValue(row: number, column: number): unknown;
  /** Visits persisted and projected values without traversing empty area. */ forEachValueInRange(
    top: number,
    left: number,
    bottom: number,
    right: number,
    visit: (display: string, raw: unknown) => void,
  ): void;
}
/** Composes dropdown interactions over the existing validation and cell owners. */
export function registerSheetDropdownPlugin(
  container: Container,
  manager: PluginManager,
  source: DropdownSourceProjection,
): void {
  const data = container.resolve<SheetDataPlugin>(SheetDataPlugin.symbol),
    queries = container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol),
    commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol);
  const createCellTransaction = (row: number, column: number, value: string | number | boolean | null) =>
    createTransaction(SheetDataPlugin.pluginKey, [
      createUpdateCellOTOperation(
        [row, column],
        value === null
          ? null
          : typeof value === 'number'
          ? { type: CellType.Number, value }
          : typeof value === 'boolean'
          ? { type: CellType.Boolean, value }
          : { type: CellType.String, value },
        data.getState().sheetData.getItem(row, column),
      ),
    ]);
  const plugin = new SheetDropdownPlugin({
    queries,
    validation: container.resolve<SheetCellInputValidationRegistry>(SheetCellInputValidationRegistry.symbol),
    readShape: () => [...data.getState().sheetData.shape] as [number, number],
    readText: (row, column) => {
      const value = source.readValue(row, column);
      return value === null || value === undefined ? '' : String(value);
    },
    forEachSourceValue: (start, end, visit) => source.forEachValueInRange(start[0], start[1], end[0], end[1], visit),
    createValueTransaction: createCellTransaction,
    createTypedValueTransaction: createCellTransaction,
  });
  container.registerInstance(SheetDropdownPlugin.symbol, plugin);
  manager.registerPlugin(plugin);
}
