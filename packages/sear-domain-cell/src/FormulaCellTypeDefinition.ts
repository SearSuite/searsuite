import { CellType, FormulaCellCommitStrategy, formatCellNumber } from '@searsuite/sear-domain-cell-types';
import { formatFormulaValue } from '@searsuite/sear-domain-cell-types';

import { type CellDisplayTextProvider } from './CellDisplayTextRegistry';

import { CellTypeDefinition } from './CellTypeDefinition';
import { createFormulaCellClipboardCodec } from './FormulaCellClipboardCodec';

/** Built-in persisted cell type for formula expressions and cached results. */
export class FormulaCellTypeDefinition extends CellTypeDefinition {
  /** Stable persisted type identifier for formula cells. */
  readonly type = CellType.Formula;
  /** Creates the commit strategy for formula input. */
  override createCommitStrategies() {
    return [new FormulaCellCommitStrategy()];
  }
  /** Returns whether the stored cell carries a formula expression. */
  override isStoredValue(cell: { formula?: unknown }): boolean {
    return typeof cell.formula === 'string';
  }
  /** Creates the display-text provider that reads evaluated formula results. */
  override createDisplayTextProvider(): CellDisplayTextProvider {
    return {
      cellType: this.type,
      getDisplayText: function getFormulaCellDisplayText(_cell, context) {
        const { formulaResultProvider: provider } = context;
        if (context.row === void 0 || context.col === void 0 || !provider) return '';
        const result = provider.getFormulaResult(context.row, context.col);
        const rows = Array.isArray(result) ? result : null;
        const firstRow = rows && Array.isArray(rows[0]) ? rows[0] : rows;
        const value = firstRow ? firstRow[0] : result;
        return typeof value === 'number'
          ? formatCellNumber(value, _cell.format, context.cellFormatLocale)
          : formatFormulaValue(value);
      },
    };
  }
  override createClipboardCodec() {
    return createFormulaCellClipboardCodec();
  }
}
