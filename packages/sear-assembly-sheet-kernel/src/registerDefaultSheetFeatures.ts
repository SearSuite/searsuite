import { SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import { SheetRulePriorityRegistry } from '@searsuite/sear-domain-cell-types';
import { registerSheetDropdownPlugin } from './runtimePlugin/dropdown/registerSheetDropdownPlugin';
import { registerSheetCheckboxPlugin } from './runtimePlugin/checkbox/registerSheetCheckboxPlugin';
import { registerSheetClearStylePlugin } from './runtimePlugin/clearStyle/registerSheetClearStylePlugin';
import { CellFormatTransferRegistry } from '@searsuite/sear-domain-cell-types';
import { registerTextFormatTransferCodecs } from '@searsuite/sear-domain-cell';
import { registerSheetFormatPainterPlugin } from './runtimePlugin/formatPainter/registerSheetFormatPainterPlugin';
import { SearError } from '@searsuite/sear-foundation-error';
import {
  CellClipboardCodecRegistry,
  CellCommitStrategyRegistry,
  CellType,
  formatCellNumber,
  ICellFormatLocaleProvider,
  SheetCellInputValidationRegistry,
  SheetDisplayedValueChanges,
} from '@searsuite/sear-domain-cell-types';

import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { CellTypeCatalog } from '@searsuite/sear-domain-cell';
import {
  IFormulaDateSystemProvider,
  IFormulaEvaluator,
  IFormulaParser,
  IFunctionRegistry,
  IFormulaResultProvider,
} from '@searsuite/sear-domain-formula-engine';
import { SheetCellEditorPlugin } from '@searsuite/sear-plugin-cell-editor';
import { type SheetMatrix } from '@searsuite/sear-domain-sheet';

import { SheetRangeReorderRegistry, type PluginManager } from '@searsuite/sear-assembly-plugin';
import {
  type ColumnShapeDimensionsCSRMatrix,
  CSRMatrix,
  type RowShapeDimensionsCSRMatrix,
} from '@searsuite/sear-domain-matrix';
import { type Container } from '@searsuite/sear-foundation-di';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import {
  readSheetDataMatrix,
  SheetDataFieldNamespace,
  SheetRowVisibilityFieldKey,
  type SheetRowVisibility,
} from '@searsuite/sear-domain-sheet';
import { DataEngine } from '@searsuite/sear-domain-state';
import {
  SheetAlignmentPlugin,
  SheetVerticalAlignmentPlugin,
  AlignmentMatrix,
  VerticalAlignmentMatrix as RuntimeVerticalAlignmentMatrix,
} from '@searsuite/sear-plugin-alignment';
import { SheetCellFillPlugin, CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { SheetCellHighlightPlugin, CellHighlightMatrix } from '@searsuite/sear-plugin-cell-highlight';
import {
  SheetDataValidationPlugin,
  DataValidationMatrix,
  DataValidationEvaluatorRegistry,
} from '@searsuite/sear-plugin-data-validation';
import { SheetCellBorderPlugin, CellBorderMatrix } from '@searsuite/sear-plugin-cell-border';
import { DuplicateMatrix, SheetDuplicatePlugin } from '@searsuite/sear-plugin-duplicate';
import { SheetFindReplacePlugin } from '@searsuite/sear-plugin-find-replace';
import { CellFormatMatrix, readSheetCellFormats, SheetCellFormatPlugin } from '@searsuite/sear-plugin-cell-format';
import { FixedRowMatrix, SheetFixedRowPlugin } from '@searsuite/sear-plugin-fixed-row';
import { SheetFreezeMatrix, SheetFreezePlugin } from '@searsuite/sear-plugin-freeze';
import { SheetSortPlugin } from '@searsuite/sear-plugin-sort';
import { SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
import { SheetFilterMatrix, SheetFilterPlugin } from '@searsuite/sear-plugin-filter';
import { FormulaResultStore, FormulaSchedulerDataSource, RecalcScheduler } from '@searsuite/sear-plugin-formula';
import { CellMergeMatrix, readSheetCellMerges, SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { formatFormulaValue } from '@searsuite/sear-domain-cell-types';
import { type SheetRuntimeAdapters } from './SheetKernelContracts';
import { createDocDocumentFormatting } from '@searsuite/sear-assembly-doc';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { Platform } from '@searsuite/sear-foundation-platform';
import { registerSheetClipboardPlugin } from './runtimePlugin/clipboard/registerSheetClipboardPlugin';
import { registerSheetCollaborationPlugin } from './runtimePlugin/collaboration/registerSheetCollaborationPlugin';
import { registerSheetFormulaPlugin } from './runtimePlugin/formula/registerSheetFormulaPlugin';
import { createCellHighlightValueSource } from './runtimePlugin/cellHighlight/createCellHighlightValueSource';
import { createSheetSortValueReader } from './runtimePlugin/sort/createSheetSortValueReader';
import { parseSheetFilterDate } from './runtimePlugin/filter/parseSheetFilterDate';
import { readFormattedNumberCellColor } from './runtimePlugin/filter/readFormattedNumberCellColor';
import { readRichTextCellColor } from './runtimePlugin/filter/readRichTextCellColor';
import { registerSheetHistoryPlugin } from './runtimePlugin/history/registerSheetHistoryPlugin';
import { registerSheetEditingFeatures } from './runtimePlugin/interaction/registerSheetEditingFeatures';
import { registerSheetPostFormulaFeatures } from './runtimePlugin/postFormulaInteraction/registerSheetPostFormulaFeatures';
import { SheetFormulaSchedulerDataSource } from './SheetFormulaSchedulerDataSource';

/** Initial state required by the default sheet feature bundle. */
export interface DefaultSheetFeatureState {
  /** Main sparse matrix containing persisted sheet cell values. */
  readonly sheetData: SheetMatrix;
  /** Row dimension matrix used by layout and rendering. */
  readonly rowSizes: RowShapeDimensionsCSRMatrix;
  /** Column dimension matrix used by layout and rendering. */
  readonly columnSizes: ColumnShapeDimensionsCSRMatrix;
  /** Sparse matrix containing cell alignment settings. */
  readonly cellAlignments: AlignmentMatrix;
  /** Sparse matrix containing cell vertical alignment settings. */
  readonly cellVerticalAlignments: RuntimeVerticalAlignmentMatrix;
  /** Sparse matrix containing cell fill settings. */
  readonly cellFills: CellFillMatrix;
  /** Sparse conditional rules stored at range anchors. */
  readonly cellHighlights: CellHighlightMatrix;
  readonly dataValidations?: DataValidationMatrix;
  readonly filters?: SheetFilterMatrix;
  /** Sparse custom borders supplied by the host, or initially empty. */
  readonly cellBorders?: CellBorderMatrix;
  /** Sparse matrix containing duplicate-item highlight settings. */
  readonly duplicates: DuplicateMatrix;
  /** Sparse matrix containing explicit cell number formats. */
  readonly cellFormats: CellFormatMatrix;
  /** Sparse matrix containing fixed row settings. */
  readonly fixedRows?: FixedRowMatrix;
  readonly freeze?: SheetFreezeMatrix;
  /** Original row sizes for currently hidden rows. */
  readonly rowHiddenOriginalSizes?: CSRMatrix<number>;
  /** Original column sizes for currently hidden columns. */
  readonly columnHiddenOriginalSizes?: CSRMatrix<number>;
  /** Sparse matrix containing merged-cell anchors and end coordinates. */
  readonly cellMerges: CellMergeMatrix;
}

/**
 * Registers the default sheet data, render, interaction, formula, and collaboration plugins.
 * @param container - Assembly DI container.
 * @param manager - Plugin manager receiving the default plugin instances.
 * @param adapters - Platform adapters supplied by the host.
 * @param state - Initial sheet state consumed by the feature-owned data plugins.
 */
export function registerDefaultSheetFeatures(
  container: Container,
  manager: PluginManager,
  adapters: SheetRuntimeAdapters,
  state: DefaultSheetFeatureState,
): void {
  const defaultConfig = container.resolve<ConfigEngine>(ConfigEngine.symbol).getDefaultConfig();
  if (state.rowSizes.getDefaultValue() === void 0) state.rowSizes.setDefaultValue(defaultConfig.defaultRowSize);
  if (state.columnSizes.getDefaultValue() === void 0)
    state.columnSizes.setDefaultValue(defaultConfig.defaultColumnSize);
  const sheetDataPlugin = new SheetDataPlugin({ sheetData: state.sheetData }, () =>
    container.resolve<CellFormatTransferRegistry>(CellFormatTransferRegistry.symbol),
  );
  container.registerInstance(SheetDataPlugin.symbol, sheetDataPlugin);
  manager.registerPlugin(sheetDataPlugin);
  const alignmentPlugin = new SheetAlignmentPlugin(
    { cellAlignments: state.cellAlignments },
    () => sheetDataPlugin.getState().sheetData,
  );
  container.registerInstance(SheetAlignmentPlugin.symbol, alignmentPlugin);
  manager.registerPlugin(alignmentPlugin);
  const verticalAlignmentPlugin = new SheetVerticalAlignmentPlugin({
    cellVerticalAlignments: state.cellVerticalAlignments,
  });
  container.registerInstance(SheetVerticalAlignmentPlugin.symbol, verticalAlignmentPlugin);
  manager.registerPlugin(verticalAlignmentPlugin);
  const cellFillPlugin = new SheetCellFillPlugin({ cellFills: state.cellFills });
  container.registerInstance(SheetCellFillPlugin.symbol, cellFillPlugin);
  manager.registerPlugin(cellFillPlugin);
  let cellCodecs: CellClipboardCodecRegistry | null = null;
  let formulaResults: IFormulaResultProvider | null = null;
  const platform = container.resolve<Platform>(Platform.symbol);
  const highlightValues = createCellHighlightValueSource(
    () => sheetDataPlugin.getState().sheetData,
    () => cellCodecs,
    () => formulaResults,
  );
  const forEachDropdownSourceValue = (
    startRow: number,
    startColumn: number,
    endRow: number,
    endColumn: number,
    visit: (value: string, raw: unknown) => void,
  ): void => {
    const formats = readSheetCellFormats(container.resolve<DataEngine>(DataEngine.symbol));
    const locale = container.resolve<ICellFormatLocaleProvider>(ICellFormatLocaleProvider.symbol).getCellFormatLocale();
    highlightValues.forEachValueWithCoordinatesInRange(
      startRow,
      startColumn,
      endRow,
      endColumn,
      (value, row, column) => {
        if (value === null || value === undefined) return;
        const rows = Array.isArray(value) ? value : null;
        const firstRow = rows && Array.isArray(rows[0]) ? rows[0] : rows;
        const scalar = firstRow ? firstRow[0] : value;
        const numeric = typeof scalar === 'number' ? scalar : highlightValues.readNumericValue(row, column);
        const cell = sheetDataPlugin.getState().sheetData.getItem(row, column);
        const raw = typeof cell?.value === 'boolean' ? cell.value : numeric ?? scalar;
        const display =
          numeric === null
            ? formatFormulaValue(scalar)
            : formatCellNumber(numeric, formats?.getItem(row, column), locale);
        if (display) visit(display, raw);
      },
    );
  };
  const styles = container.resolve<SheetCellStyleRegistry>(SheetCellStyleRegistry.symbol);
  const priorities = new SheetRulePriorityRegistry();
  container.registerInstance(SheetRulePriorityRegistry.symbol, priorities);
  const highlightPlugin = new SheetCellHighlightPlugin(
    { cellHighlights: state.cellHighlights },
    {
      createId: () => platform.createId('highlight'),
      nextPriority: () => priorities.nextPriority(),
      platform,
      displayedValueChanges: container.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol),
      ...highlightValues,
    },
  );
  container.registerInstance(SheetCellHighlightPlugin.symbol, highlightPlugin);
  manager.registerPlugin(highlightPlugin);
  priorities.register('sheet.cellHighlight', () => highlightPlugin.getHighestPriority());
  const inputValidation = new SheetCellInputValidationRegistry();
  container.registerInstance(SheetCellInputValidationRegistry.symbol, inputValidation);
  const validationPlugin = new SheetDataValidationPlugin(
    {
      dataValidations:
        state.dataValidations ?? new DataValidationMatrix(void 0, [...state.sheetData.shape] as [number, number]),
    },
    {
      createId: () => platform.createId('validation'),
      currentDateTime: () => platform.currentDateTime(),
      inputValidation,
      evaluators: new DataValidationEvaluatorRegistry(),
      readValue: highlightValues.readValue,
      evaluateFormulaInput: (formula, row, column) => {
        const parser = container.resolve<IFormulaParser>(IFormulaParser.symbol);
        const evaluator = container.resolve<IFormulaEvaluator>(IFormulaEvaluator.symbol);
        const source = container.resolve<SheetFormulaSchedulerDataSource>(FormulaSchedulerDataSource.symbol);
        const results = container.resolve<FormulaResultStore>(FormulaResultStore.symbol);
        const context = source.createEvalContext(results);
        const currentCell = { row, col: column };
        return evaluator.evaluate(
          parser.parse(formula),
          context.forFormulaCell?.(currentCell) ?? { ...context, currentCell },
        );
      },
      createNumericControlValueTransaction: (row, column, value) =>
        createTransaction(SheetDataPlugin.pluginKey, [
          createUpdateCellOTOperation(
            [row, column],
            { type: CellType.Number, value },
            sheetDataPlugin.getState().sheetData.getItem(row, column),
          ),
        ]),
      readSourceValues: (start, end) => {
        const values: string[] = [];
        forEachDropdownSourceValue(start[0], start[1], end[0], end[1], (display, raw) => {
          values.push(display);
          if (
            (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') &&
            String(raw) !== display
          )
            values.push(String(raw));
        });
        return values;
      },
    },
  );
  container.registerInstance(SheetDataValidationPlugin.symbol, validationPlugin);
  manager.registerPlugin(validationPlugin);
  const cellBorderPlugin = new SheetCellBorderPlugin({
    cellBorders: state.cellBorders ?? new CellBorderMatrix(void 0, [...state.sheetData.shape] as [number, number]),
  });
  container.registerInstance(SheetCellBorderPlugin.symbol, cellBorderPlugin);
  manager.registerPlugin(cellBorderPlugin);
  const cellFormatPlugin = new SheetCellFormatPlugin({ cellFormats: state.cellFormats });
  container.registerInstance(SheetCellFormatPlugin.symbol, cellFormatPlugin);
  manager.registerPlugin(cellFormatPlugin);
  const fixedRowPlugin = new SheetFixedRowPlugin({
    fixedRows: state.fixedRows ?? new FixedRowMatrix(void 0, [1, state.rowSizes.shape[1]]),
  });
  container.registerInstance(SheetFixedRowPlugin.symbol, fixedRowPlugin);
  manager.registerPlugin(fixedRowPlugin);
  const freezePlugin = new SheetFreezePlugin({ freeze: state.freeze ?? new SheetFreezeMatrix() }, () => [
    state.rowSizes.shape[1],
    state.columnSizes.shape[1],
  ]);
  container.registerInstance(SheetFreezePlugin.symbol, freezePlugin);
  manager.registerPlugin(freezePlugin);
  const dataEngine = container.resolve<DataEngine>(DataEngine.symbol);
  const cellMergePlugin = new SheetCellMergePlugin(
    { cellMerges: state.cellMerges },
    {
      target: SheetDataPlugin.pluginKey,
      readCell: (row, column) => {
        const matrix = readSheetDataMatrix(dataEngine);
        if (!matrix) throw new SearError('Sheet cell merge cannot read the current sheet data.');
        return matrix.getItem(row, column);
      },
    },
  );
  container.registerInstance(SheetCellMergePlugin.symbol, cellMergePlugin);
  manager.registerPlugin(cellMergePlugin);
  registerSheetEditingFeatures(container, manager);
  validationPlugin.registerCommitStrategies(
    container.resolve<CellCommitStrategyRegistry>(CellCommitStrategyRegistry.symbol),
  );
  registerTextFormatTransferCodecs(
    container.resolve<CellFormatTransferRegistry>(CellFormatTransferRegistry.symbol),
    () => createDocDocumentFormatting(),
  );
  registerSheetClipboardPlugin(container, manager);
  registerSheetFormulaPlugin(container, manager);
  formulaResults = container.resolve<IFormulaResultProvider>(IFormulaResultProvider.symbol);
  cellCodecs = container.resolve<CellClipboardCodecRegistry>(CellClipboardCodecRegistry.symbol);
  container
    .resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol)
    .bindFormulaRegistry(container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol));
  const duplicatePlugin = new SheetDuplicatePlugin(
    { duplicates: state.duplicates },
    sheetDataPlugin,
    container.resolve<CellClipboardCodecRegistry>(CellClipboardCodecRegistry.symbol),
    (row, column, cell) => {
      const format = readSheetCellFormats(dataEngine)?.getItem(row, column);
      const locale = container
        .resolve<ICellFormatLocaleProvider>(ICellFormatLocaleProvider.symbol)
        .getCellFormatLocale();
      if (!cell) {
        const value = highlightValues.readValue(row, column);
        return value === null || value === undefined
          ? ''
          : typeof value === 'number'
          ? formatCellNumber(value, format, locale)
          : formatFormulaValue(value);
      }
      return container
        .resolve<CellTypeCatalog>(CellTypeCatalog.symbol)
        .getDisplayText(
          { ...cell, format },
          { row, col: column, formulaResultProvider: formulaResults ?? undefined, cellFormatLocale: locale },
        );
    },
    container.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol),
  );
  container.registerInstance(SheetDuplicatePlugin.symbol, duplicatePlugin);
  manager.registerPlugin(duplicatePlugin);
  const findReplacePlugin = new SheetFindReplacePlugin(
    sheetDataPlugin,
    container.resolve<CellClipboardCodecRegistry>(CellClipboardCodecRegistry.symbol),
    container.resolve<CellCommitStrategyRegistry>(CellCommitStrategyRegistry.symbol),
    {
      readValue: (row, column, cell) => {
        const format = readSheetCellFormats(dataEngine)?.getItem(row, column);
        const locale = container
          .resolve<ICellFormatLocaleProvider>(ICellFormatLocaleProvider.symbol)
          .getCellFormatLocale();
        if (cell) {
          return container
            .resolve<CellTypeCatalog>(CellTypeCatalog.symbol)
            .getDisplayText(
              { ...cell, format },
              { row, col: column, formulaResultProvider: formulaResults ?? undefined, cellFormatLocale: locale },
            );
        }
        const value = highlightValues.readValue(row, column);
        return value === null || value === undefined
          ? null
          : typeof value === 'number'
          ? formatCellNumber(value, format, locale)
          : formatFormulaValue(value);
      },
      forEachProjectedValueInRange: (startRow, startColumn, endRow, endColumn, visit) =>
        formulaResults?.forEachFormulaResultInRange?.(startRow, startColumn, endRow, endColumn, visit),
      isArrayResultAnchor: (row, column) => Array.isArray(formulaResults?.getFormulaResult(row, column)),
      isCoveredMergeCell: (row, column) => {
        const range = readSheetCellMerges(dataEngine)?.findRange(row, column);
        if (!range) return false;
        const [anchorRow, anchorColumn] = range.getPoint(0);
        return row !== anchorRow || column !== anchorColumn;
      },
      isRowHidden: (row) => {
        const visibility = dataEngine.readDataViewField<SheetRowVisibility>(
          SheetDataFieldNamespace,
          SheetRowVisibilityFieldKey,
        );
        return (visibility?.active && visibility.isRowFiltered(row)) || false;
      },
    },
    inputValidation,
  );
  container.registerInstance(SheetFindReplacePlugin.symbol, findReplacePlugin);
  manager.registerPlugin(findReplacePlugin);
  const sortPlugin = new SheetSortPlugin({
    readMatrix: () => sheetDataPlugin.getState().sheetData,
    readValue: createSheetSortValueReader(
      () => sheetDataPlugin.getState().sheetData,
      () => container.resolve<CellClipboardCodecRegistry>(CellClipboardCodecRegistry.symbol),
      () => container.resolve<IFormulaResultProvider>(IFormulaResultProvider.symbol),
    ),
    reorders: container.resolve<SheetRangeReorderRegistry>(SheetRangeReorderRegistry.symbol),
    platform,
    compareText: (left, right) => left.localeCompare(right),
    reconcileSelection: () =>
      container.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol).reconcileActiveCellVisibility(),
  });
  container.registerInstance(SheetSortPlugin.symbol, sortPlugin);
  manager.registerPlugin(sortPlugin);
  const filterPlugin = new SheetFilterPlugin(
    { filters: state.filters ?? new SheetFilterMatrix() },
    {
      dataTarget: SheetDataPlugin.pluginKey,
      invalidateVisibilityAggregates: () =>
        container.resolve<RecalcScheduler>(RecalcScheduler.symbol).markFunctionsDirty(['SUBTOTAL', 'AGGREGATE']),
      readShape: () => [...sheetDataPlugin.getState().sheetData.shape] as [number, number],
      readValue: createSheetSortValueReader(
        () => sheetDataPlugin.getState().sheetData,
        () => container.resolve<CellClipboardCodecRegistry>(CellClipboardCodecRegistry.symbol),
        () => container.resolve<IFormulaResultProvider>(IFormulaResultProvider.symbol),
      ),
      readDisplayValue: (row, column, value) => {
        if (typeof value !== 'number') return value === null || value === undefined ? '' : String(value);
        const formats = readSheetCellFormats(container.resolve<DataEngine>(DataEngine.symbol));
        const locale = container
          .resolve<ICellFormatLocaleProvider>(ICellFormatLocaleProvider.symbol)
          .getCellFormatLocale();
        return formatCellNumber(value, formats?.getItem(row, column), locale);
      },
      forEachStoredInRange: (startRow, column, endRow, visit) => {
        const matrix = sheetDataPlugin.getState().sheetData;
        matrix.forEachStoredInRange(startRow, column, endRow, column, (_cell, row) => visit(row));
        formulaResults?.forEachFormulaResultInRange?.(startRow, column, endRow, column, (row) => {
          if (matrix.getItem(row, column) === null) visit(row);
        });
      },
      readColor: (row, column, property) => {
        const visual = styles.read(row, column);
        if (property === 'fill') return visual.fill ?? null;
        const cell = sheetDataPlugin.getState().sheetData.getItem(row, column);
        const formats = readSheetCellFormats(container.resolve<DataEngine>(DataEngine.symbol));
        const locale = container
          .resolve<ICellFormatLocaleProvider>(ICellFormatLocaleProvider.symbol)
          .getCellFormatLocale();
        return (
          readRichTextCellColor(cell) ??
          readFormattedNumberCellColor(cell, formats?.getItem(row, column), locale) ??
          visual.textColor ??
          null
        );
      },
      parseDate: (value) =>
        parseSheetFilterDate(value, container.resolve<IFormulaDateSystemProvider>(IFormulaDateSystemProvider.symbol)),
      platform,
      displayedValueChanges: container.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol),
    },
  );
  container.registerInstance(SheetFilterPlugin.symbol, filterPlugin);
  manager.registerPlugin(filterPlugin);
  registerSheetPostFormulaFeatures(container, manager, {
    rowSizes: state.rowSizes,
    columnSizes: state.columnSizes,
    rowHiddenOriginalSizes: state.rowHiddenOriginalSizes ?? new CSRMatrix<number>(void 0, [1, state.rowSizes.shape[1]]),
    columnHiddenOriginalSizes:
      state.columnHiddenOriginalSizes ?? new CSRMatrix<number>(void 0, [1, state.columnSizes.shape[1]]),
  });
  registerSheetFormatPainterPlugin(container, manager);
  registerSheetClearStylePlugin(container, manager);
  registerSheetCheckboxPlugin(container, manager);
  registerSheetDropdownPlugin(container, manager, {
    readValue: highlightValues.readValue,
    forEachValueInRange: (top, left, bottom, right, visit) =>
      forEachDropdownSourceValue(top, left, bottom, right, visit),
  });
  registerSheetHistoryPlugin(container, manager);
  registerSheetCollaborationPlugin(container, manager, adapters);
}
