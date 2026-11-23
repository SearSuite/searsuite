import {
  type CellKey,
  type EvalContext,
  type FormulaRangeCell,
  type FormulaValue,
  FormulaErrorCode,
  IFormulaLocaleProvider,
  IFormulaDateSystemProvider,
  IFormulaTextServiceProvider,
  IFormulaExternalServiceProvider,
  IFormulaSourceProvider,
  IFunctionRegistry,
  IFormulaParser,
  IFormulaWorkbookMetadataProvider,
  FormulaLanguageServiceDefinition,
  createFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { cellKey, fromCellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform, XmlXPathEvaluator } from '@searsuite/sear-foundation-platform';
import { FormulaResultStore, FormulaSchedulerDataSource } from '@searsuite/sear-plugin-formula';
import { computeViewportRange } from '@searsuite/sear-render';
import {
  DataEngine, readSheetDataMatrix, readSheetRawRowSizes, readSheetRowHiddenOriginalSizes,
  SheetDataFieldNamespace, SheetRowVisibilityFieldKey, type SheetRowVisibility,
} from '@searsuite/sear-render-engine';
import { readSheetColumnSizes, readSheetRowSizes } from '@searsuite/sear-plugin-resize';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { CellType, SheetHorizontalAlignment, cellFormatToExcelCode } from '@searsuite/sear-domain-cell-types';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { readSheetCellFormats } from '@searsuite/sear-plugin-cell-format';
import { readSheetCellAlignments } from '@searsuite/sear-plugin-alignment';
import { readSheetCellMerges, SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { resolveSheetFormulaTextReference } from './resolveSheetFormulaTextReference';
import { findNestedAggregateFormulaName } from './findNestedAggregateFormulaName';

/**
 * Default sheet adapter for formula scheduler data access.
 *
 * This assembly-owned adapter converts render/runtime services into the narrow
 * formula scheduler contract, keeping RecalcScheduler independent from
 * DataEngine, ScrollManager, resize readers, and render viewport math.
 */
@Injectable()
export class SheetFormulaSchedulerDataSource implements FormulaSchedulerDataSource {
  /** DI token for resolving SheetFormulaSchedulerDataSource. */
  public static readonly symbol = Symbol.for('SheetFormulaSchedulerDataSource');

  /** Creates a SheetFormulaSchedulerDataSource instance. */
  public constructor(
    @Inject(DataEngine.symbol) private readonly dataEngine: DataEngine,
    @Inject(ScrollManager.symbol) private readonly scrollManager: ScrollManager,
    @Inject(Platform.symbol) private readonly platform: Platform,
    @Inject(IFormulaLocaleProvider.symbol) private readonly localeProvider?: IFormulaLocaleProvider,
    @Inject(IFormulaTextServiceProvider.symbol) private readonly textServiceProvider?: IFormulaTextServiceProvider,
    @Inject(IFormulaExternalServiceProvider.symbol) private readonly externalServices?: IFormulaExternalServiceProvider,
    @Inject(IFunctionRegistry.symbol) private readonly functions?: IFunctionRegistry,
    @Inject(XmlXPathEvaluator.symbol) private readonly xmlXPath?: XmlXPathEvaluator,
    @Inject(IFormulaSourceProvider.symbol) private readonly formulaSource?: IFormulaSourceProvider,
    @Inject(IFormulaDateSystemProvider.symbol) private readonly dateSystemProvider?: IFormulaDateSystemProvider,
    @Inject(IFormulaParser.symbol) private readonly formulaParser?: IFormulaParser,
    @Inject(IFormulaWorkbookMetadataProvider.symbol) private readonly workbookMetadata?: IFormulaWorkbookMetadataProvider,
  ) {}

  public isSpillObstacleTransaction(transaction: Transaction): boolean {
    return transaction.pluginKey === SheetCellMergePlugin.pluginKey;
  }

  /** @inheritdoc */
  public createEvalContext(resultStore: FormulaResultStore): EvalContext {
    const sheetData = readSheetDataMatrix(this.dataEngine);
    if (!sheetData) {
      this.platform.warn('FormulaSchedulerDataSource createEvalContext fell back: sheet data field is missing.');
      return this.createReferenceErrorContext();
    }

    const [rowCount, colCount] = sheetData.shape;
    const rowSizes = readSheetRawRowSizes(this.dataEngine);
    const hiddenRows = readSheetRowHiddenOriginalSizes(this.dataEngine);
    const rowVisibility = this.dataEngine.readDataViewField<SheetRowVisibility>(
      SheetDataFieldNamespace, SheetRowVisibilityFieldKey,
    );
    const cellFormats = readSheetCellFormats(this.dataEngine);
    const cellAlignments = readSheetCellAlignments(this.dataEngine);
    const cellMerges = readSheetCellMerges(this.dataEngine);
    const columnSizes = readSheetColumnSizes(this.dataEngine);
    const aggregateFormulaNames = new Map<string, string | undefined>();
    const formulaParser = this.formulaParser;
    const isCellInBounds = (row: number, col: number): boolean =>
      row >= 0 && row < rowCount && col >= 0 && col < colCount;

    const dateTimeLocale = this.localeProvider?.getDateTimeLocale();
    const textLocale = this.localeProvider?.getTextLocale?.();
    const phoneticReader = this.textServiceProvider?.getPhoneticReader?.();
    const languageService = this.textServiceProvider?.getLanguageService?.();
    const context: EvalContext = {
      ...(this.dateSystemProvider === undefined ? {} : { dateSystem: this.dateSystemProvider.getDateSystem() }),
      ...(this.formulaSource === undefined ? {} : { formulaSource: this.formulaSource }),
      ...(this.xmlXPath === undefined ? {} : { xmlXPath: this.xmlXPath }),
      ...(this.externalServices === undefined ? {} : { externalServices: this.externalServices }),
      isCellInBounds,
      referenceResolver: { resolve: (text, options) => resolveSheetFormulaTextReference(text, options, [rowCount, colCount]) },
      currentDateTime: (): number => this.platform.currentDateTime(),
      ...(dateTimeLocale === void 0 ? {} : { dateTimeLocale }),
      ...(textLocale === void 0 ? {} : { textLocale }),
      ...(phoneticReader === void 0 ? {} : { phoneticReader }),
      ...(languageService === void 0 ? {} : { languageService }),
      metadata: {
        ...(this.workbookMetadata === undefined ? {} : { readWorkbook: () => this.workbookMetadata?.readWorkbook() }),
        readVisibleOrigin: () => this.getVisibleOrigin(),
        readCell: ({ row, col, sheetName }) => {
          if (sheetName !== undefined || !isCellInBounds(row, col)) return undefined;
          const cell = sheetData.getItem(row, col);
          const value = resultStore.cellToFormulaValue(row, col, cell);
          const isSpillCell = !cell && resultStore.getAt(row, col) !== undefined;
          const source =
            isSpillCell ? 'value' : !cell || cell.type === CellType.Empty
              ? 'empty' : cell.type === CellType.Formula ? 'formula' : 'value';
          const formula =
            cell?.type === CellType.Formula && typeof cell.formula === 'string' ? cell.formula : undefined;
          const numberFormat = cellFormatToExcelCode(cellFormats?.getItem(row, col));
          const alignment = cellAlignments?.getItem(row, col) as SheetHorizontalAlignment | null | undefined;
          const labelPrefix = typeof value === 'string' || isFormulaText(value)
            ? alignment === SheetHorizontalAlignment.Center ? '^'
              : alignment === SheetHorizontalAlignment.Right ? '"' : "'"
            : undefined;
          const widthPixels = columnSizes?.getItem(0, col);
          // CELL width uses default-font characters (7 px) after 5 px of cell padding.
          const width = widthPixels == null ? undefined : Math.max(0, Math.round((widthPixels - 5) / 7));
          return {
            reference: { row, col },
            source,
            value,
            ...(formula === undefined ? {} : { formula }),
            ...(numberFormat === undefined ? {} : { numberFormat }),
            ...(labelPrefix === undefined ? {} : { labelPrefix }),
            ...(width === undefined ? {} : { width }),
          };
        },
      },
      getSheetShape: (): [number, number] => [rowCount, colCount],
      getCellValue: (row: number, col: number): FormulaValue => {
        if (!isCellInBounds(row, col)) return createFormulaError(FormulaErrorCode.Reference);
        const cell = sheetData.getItem(row, col);
        return resultStore.cellToFormulaValue(row, col, cell);
      },
      getSpillValue: (row, col, sheetName) =>
        sheetName === undefined && isCellInBounds(row, col) ? resultStore.get(cellKey(row, col)) : undefined,
      iterateRange: (startRow: number, startCol: number, endRow: number, endCol: number): Iterable<FormulaValue> => {
        if (!isCellInBounds(startRow, startCol) || !isCellInBounds(endRow, endCol)) {
          return [createFormulaError(FormulaErrorCode.Reference)];
        }
        return {
          *[Symbol.iterator]() {
            for (let r = startRow; r <= endRow; r++) {
              for (let c = startCol; c <= endCol; c++) {
                const cell = sheetData.getItem(r, c);
                yield resultStore.cellToFormulaValue(r, c, cell);
              }
            }
          },
        };
      },
      iterateRangeCells: (startRow, startCol, endRow, endCol) => {
        if (!isCellInBounds(startRow, startCol) || !isCellInBounds(endRow, endCol)) {
          return [
            { row: startRow, col: startCol, value: createFormulaError(FormulaErrorCode.Reference), source: 'empty' },
          ];
        }
        return {
          *[Symbol.iterator]() {
            for (let r = startRow; r <= endRow; r++) {
              for (let c = startCol; c <= endCol; c++) {
                const cell = sheetData.getItem(r, c);
                const value = resultStore.cellToFormulaValue(r, c, cell);
                const source =
                  !cell && resultStore.getAt(r, c) !== undefined
                    ? 'value'
                    : !cell || cell.type === CellType.Empty
                    ? 'empty'
                    : cell.type === CellType.Formula
                    ? 'formula'
                    : 'value';
                const hidden = rowSizes?.getItem(0, r) === 0 || hiddenRows?.getItem(0, r) != null;
                let formulaName: string | undefined;
                if (cell?.type === CellType.Formula && typeof cell.formula === 'string') {
                  if (aggregateFormulaNames.has(cell.formula)) {
                    formulaName = aggregateFormulaNames.get(cell.formula);
                  } else {
                    formulaName = formulaParser
                      ? findNestedAggregateFormulaName(cell.formula, formulaParser)
                      : /^\s*=\s*([A-Za-z_][A-Za-z0-9_.]*)/.exec(cell.formula)?.[1]?.toUpperCase();
                    aggregateFormulaNames.set(cell.formula, formulaName);
                  }
                }
                const filtered = rowVisibility?.isRowFiltered(r) ?? false;
                const metadata: FormulaRangeCell = formulaName
                  ? { row: r, col: c, value, hidden, filtered, source, formulaName }
                  : { row: r, col: c, value, hidden, filtered, source };
                yield metadata;
              }
            }
          },
        };
      },
      isCellOccupied: (row, col) => sheetData.getItem(row, col) != null || cellMerges?.findRange(row, col) != null,
    };
    context.forFormulaCell = (currentCell) => ({
      ...context,
      currentCell,
      arrayFormulaMode: sheetData.getItem(currentCell.row, currentCell.col)?.formulaEvaluationMode ?? 'dynamic',
    });
    return context;
  }

  /** @inheritdoc */
  public getViewportFormulaKeys(formulaKeys: Iterable<CellKey>): Set<CellKey> {
    const rowSizes = readSheetRowSizes(this.dataEngine);
    const columnSizes = readSheetColumnSizes(this.dataEngine);
    if (!rowSizes || !columnSizes) {
      this.platform.warn(
        'FormulaSchedulerDataSource getViewportFormulaKeys skipped: sheet dimension fields are missing.',
      );
      return new Set<CellKey>();
    }

    const { startRow, endRow, startCol, endCol } = computeViewportRange(this.scrollManager, rowSizes, columnSizes);
    const viewport = new Set<CellKey>();

    for (const key of formulaKeys) {
      const [row, col] = fromCellKey(key);
      if (row >= startRow && row <= endRow && col >= startCol && col <= endCol) {
        viewport.add(key);
      }
    }

    return viewport;
  }

  /** @inheritdoc */
  public getVisibleOrigin(): { row: number; col: number } {
    const rowSizes = readSheetRowSizes(this.dataEngine);
    const columnSizes = readSheetColumnSizes(this.dataEngine);
    const { x, y } = this.scrollManager.getState();
    return {
      row: rowSizes ? firstVisibleDimensionIndex(rowSizes, y) : 0,
      col: columnSizes ? firstVisibleDimensionIndex(columnSizes, x) : 0,
    };
  }

  /** @inheritdoc */
  public onViewportChanged(handler: () => void): () => void {
    return this.scrollManager.subscribeScroll(handler);
  }

  /** Wakes functions whose descriptors depend on an invalidated service. */
  public onExternalServiceInvalidated(handler: (functionNames: readonly string[]) => void): () => void {
    const invalidate = (serviceIds: readonly string[]) => {
      const names =
        this.functions
          ?.list()
          .filter((name) =>
            this.functions?.get(name)?.descriptor?.externalServices?.some((id) => serviceIds.includes(id)),
          ) ?? [];
      if (names.length > 0) handler(names);
    };
    const invalidateLanguage = () => invalidate([FormulaLanguageServiceDefinition.id]);
    const disposeLanguage =
      this.textServiceProvider?.subscribeInvalidation?.(invalidateLanguage) ??
      this.textServiceProvider?.getLanguageService?.()?.subscribeInvalidation?.(invalidateLanguage) ??
      (() => {});
    const disposeExternal = this.externalServices?.subscribeInvalidation(invalidate);
    return () => {
      disposeExternal?.();
      disposeLanguage();
    };
  }

  private createReferenceErrorContext(): EvalContext {
    const dateTimeLocale = this.localeProvider?.getDateTimeLocale();
    const textLocale = this.localeProvider?.getTextLocale?.();
    const phoneticReader = this.textServiceProvider?.getPhoneticReader?.();
    const languageService = this.textServiceProvider?.getLanguageService?.();
    const context: EvalContext = {
      ...(this.dateSystemProvider === undefined ? {} : { dateSystem: this.dateSystemProvider.getDateSystem() }),
      ...(this.formulaSource === undefined ? {} : { formulaSource: this.formulaSource }),
      ...(this.externalServices === undefined ? {} : { externalServices: this.externalServices }),
      isCellInBounds: (_row: number, _col: number): boolean => false,
      currentDateTime: (): number => this.platform.currentDateTime(),
      ...(dateTimeLocale === void 0 ? {} : { dateTimeLocale }),
      ...(textLocale === void 0 ? {} : { textLocale }),
      ...(phoneticReader === void 0 ? {} : { phoneticReader }),
      ...(languageService === void 0 ? {} : { languageService }),
      getSheetShape: (): [number, number] => [0, 0],
      getCellValue: (_row: number, _col: number): FormulaValue => createFormulaError(FormulaErrorCode.Reference),
      iterateRange: (
        _startRow: number,
        _startCol: number,
        _endRow: number,
        _endCol: number,
      ): Iterable<FormulaValue> => [createFormulaError(FormulaErrorCode.Reference)],
    };
    context.forFormulaCell = (currentCell) => ({ ...context, currentCell });
    return context;
  }
}

function firstVisibleDimensionIndex(dimensions: DimensionsCSRMatrix, offset: number): number {
  const count = dimensions.shape[1];
  if (count === 0) return 0;
  const position = Math.min(Math.max(offset, 0), dimensions.getDimensionRightBoundaryByIndex(count - 1));
  if (dimensions.getDimensionRightBoundaryByIndex(0) > position) return 0;
  return Math.min(dimensions.getLeftBoundaryColIndexByDimension(position) + 1, count - 1);
}
