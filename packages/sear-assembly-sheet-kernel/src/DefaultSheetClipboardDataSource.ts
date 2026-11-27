import { type SheetRangeBounds } from '@searsuite/sear-assembly-commands';
import {
  SheetClipboardTransferRegistry,
  SheetFormatTransferRegistry,
  SheetRangeMoveRegistry,
  type PluginManager,
  type SheetClipboardTransferRequest,
  type SheetPortableClipboardTransfer,
  type SheetPortableFormatTransfer,
} from '@searsuite/sear-assembly-plugin';
import { type SheetKernel } from './SheetKernel';
import { PipelineStepKind, type Pipeline } from '@searsuite/sear-assembly-plugin';
import { SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { GetSelection } from '@searsuite/sear-plugin-selection';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { readSheetDataMatrix, readSheetRowSizes } from '@searsuite/sear-domain-sheet';
import { DataEngine } from '@searsuite/sear-domain-state';
import { CellType, SheetCellInputValidationRegistry, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { IFormulaResultProvider } from '@searsuite/sear-domain-formula-engine';
import { readSheetCellFormats, SheetCellFormatPlugin } from '@searsuite/sear-plugin-cell-format';
import {
  createMergeCellsOperations,
  createUnmergeCellsOperations,
  readSheetCellMerges,
  SheetCellMergePlugin,
} from '@searsuite/sear-plugin-cell-merge';
import {
  SheetClipboardError,
  SheetClipboardErrorCode,
  SheetClipboardCutSession,
  SheetClipboardSheetIdentity,
  type SheetClipboardRangeInput,
  type SheetClipboardCellPoint,
  type SheetClipboardDataSource,
  type SheetClipboardMergedRange,
} from '@searsuite/sear-plugin-clipboard';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { Platform } from '@searsuite/sear-foundation-platform';

import { previewSheetDocumentState } from './SheetStateSnapshotCommands';
import { type SheetClipboardWorkbookBridge } from './SheetClipboardWorkbookBridge';

/** Default data source bridging clipboard commands to the active Sheet data view. */
@Injectable()
export class DefaultSheetClipboardDataSource implements SheetClipboardDataSource {
  readonly #dataEngine: DataEngine;
  readonly #queries: SheetQueryRegistry;
  readonly #ownerFormats: SheetFormatTransferRegistry;
  readonly #ownerClipboard: SheetClipboardTransferRegistry;
  readonly #platform: Platform;
  readonly #rangeMoves: SheetRangeMoveRegistry;
  readonly #inputValidation: SheetCellInputValidationRegistry;

  public readonly target = SheetDataPlugin.pluginKey;
  public readonly formatTarget = SheetCellFormatPlugin.pluginKey;
  public readonly cutSourceId: string;
  #previewRuntime: {
    readonly core: SheetKernel;
    readonly plugins: PluginManager;
    readonly bridge: SheetClipboardWorkbookBridge | null;
  } | null = null;

  public constructor(
    @Inject(DataEngine.symbol) dataEngine: DataEngine,
    @Inject(SheetQueryRegistry.symbol) queries: SheetQueryRegistry,
    @Inject(SheetFormatTransferRegistry.symbol) ownerFormats: SheetFormatTransferRegistry,
    @Inject(SheetClipboardTransferRegistry.symbol) ownerClipboard: SheetClipboardTransferRegistry,
    @Inject(Platform.symbol) platform: Platform,
    @Inject(SheetRangeMoveRegistry.symbol) rangeMoves: SheetRangeMoveRegistry,
    @Inject(SheetClipboardCutSession.symbol) public readonly cutSession: SheetClipboardCutSession,
    @Inject(SheetClipboardSheetIdentity.symbol) identity: SheetClipboardSheetIdentity,
    @Inject(SheetCellInputValidationRegistry.symbol) inputValidation: SheetCellInputValidationRegistry,
  ) {
    this.#dataEngine = dataEngine;
    this.#queries = queries;
    this.#ownerFormats = ownerFormats;
    this.#ownerClipboard = ownerClipboard;
    this.#platform = platform;
    this.#rangeMoves = rangeMoves;
    this.#inputValidation = inputValidation;
    this.cutSourceId = identity.id;
  }

  #formulaResults?: IFormulaResultProvider;

  public bindFormulaResults(results: IFormulaResultProvider): void {
    if (this.#formulaResults) throw new SearError('Clipboard formula results are already bound.');
    this.#formulaResults = results;
  }

  public planRangeMove(source: SheetClipboardRangeInput, destination: SheetClipboardRangeInput) {
    return this.#rangeMoves.plan({ source, destination });
  }

  public bindPreviewRuntime(
    core: SheetKernel,
    plugins: PluginManager,
    bridge: SheetClipboardWorkbookBridge | null,
  ): void {
    this.#previewRuntime = { core, plugins, bridge };
  }

  public prepareCrossSheetCut(cutId: string, clearPipeline: Pipeline): void {
    const runtime = this.#previewRuntime;
    if (!runtime?.bridge) return;
    const transactions = clearPipeline.steps
      .filter((step) => step.kind === PipelineStepKind.Transaction && step.transaction)
      .map((step) => step.transaction!);
    runtime.bridge.prepareCut(
      cutId,
      this.cutSourceId,
      previewSheetDocumentState(runtime.core, runtime.plugins, []),
      previewSheetDocumentState(runtime.core, runtime.plugins, transactions),
    );
  }

  public scheduleCrossSheetMove(cutId: string, sourceId: string, pastePipeline: Pipeline): Promise<void> {
    const runtime = this.#previewRuntime;
    if (!runtime?.bridge) throw new SearError('Cross-sheet clipboard move requires a Workbook bridge.');
    const transactions = pastePipeline.steps
      .filter((step) => step.kind === PipelineStepKind.Transaction && step.transaction)
      .map((step) => step.transaction!);
    const targetAfter = previewSheetDocumentState(runtime.core, runtime.plugins, transactions);
    return Promise.resolve().then(() => runtime.bridge!.commitMove(cutId, sourceId, this.cutSourceId, targetAfter));
  }

  public getSelection(): SheetRangeBounds | null {
    return this.#queries.run(GetSelection, void 0);
  }

  public getRowCount(): number {
    return readSheetDataMatrix(this.#dataEngine)?.shape[0] ?? 0;
  }

  public getColumnCount(): number {
    return readSheetDataMatrix(this.#dataEngine)?.shape[1] ?? 0;
  }

  public readCell(row: number, column: number): CellMatrixElement | null {
    return readSheetDataMatrix(this.#dataEngine)?.getItem(row, column) ?? null;
  }

  public readCopyCell(row: number, column: number): CellMatrixElement | null {
    const stored = this.readCell(row, column);
    if (stored) return stored;
    return this.#readFormulaResultCell(row, column);
  }

  public readCopyValueCell(row: number, column: number): CellMatrixElement | null {
    const stored = this.readCell(row, column);
    return stored?.type === CellType.Formula
      ? this.#readFormulaResultCell(row, column)
      : stored ?? this.#readFormulaResultCell(row, column);
  }

  #readFormulaResultCell(row: number, column: number): CellMatrixElement | null {
    const value = this.#formulaResults?.getFormulaResult(row, column);
    if (typeof value === 'number') return { type: CellType.Number, value };
    if (typeof value === 'boolean') return { type: CellType.Boolean, value };
    if (typeof value === 'string') return { type: CellType.String, value };
    if (value && !Array.isArray(value) && typeof value === 'object') {
      if (value.kind === 'text') return { type: CellType.String, value: value.value };
      if (value.kind === 'error') return { type: CellType.String, value: value.code };
      if (value.kind === 'cube-member' || value.kind === 'cube-set') {
        return { type: CellType.String, value: value.caption };
      }
    }
    return null;
  }

  public validatePasteCell(row: number, column: number, cell: CellMatrixElement | null) {
    return this.#inputValidation.validate(row, column, cell?.value == null ? '' : String(cell.value));
  }

  public validateCutCell(row: number, column: number) {
    return this.#inputValidation.validateClear(row, column);
  }

  public readCellFormat(row: number, column: number) {
    return readSheetCellFormats(this.#dataEngine)?.getItem(row, column) ?? null;
  }

  public isRowVisible(row: number): boolean {
    return readSheetRowSizes(this.#dataEngine)?.getItem(0, row) !== 0;
  }

  public createClipboardCutId(): string {
    return this.#platform.createId('sheet-cut');
  }

  public captureOwnerFormats(range: SheetRangeBounds): readonly SheetPortableFormatTransfer[] {
    return this.#ownerFormats.capturePortable(range);
  }

  public planOwnerFormats(captured: readonly SheetPortableFormatTransfer[], target: SheetRangeBounds) {
    return this.#ownerFormats.planPortable(captured, target);
  }

  public clearOwnerFormats(range: SheetRangeBounds) {
    return this.#ownerFormats.clear(range);
  }

  public captureOwnerData(range: SheetRangeBounds): readonly SheetPortableClipboardTransfer[] {
    return this.#ownerClipboard.capturePortable(range);
  }

  public planOwnerData(requests: readonly SheetClipboardTransferRequest[]) {
    return this.#ownerClipboard.planPortable(requests);
  }

  public clearOwnerData(range: SheetRangeBounds) {
    return this.#ownerClipboard.clear(range);
  }

  public getMergedRange(row: number, column: number): SheetRangeBounds | null {
    const range = readSheetCellMerges(this.#dataEngine)?.findRange(row, column);
    return range ? { start: range.getPoint(0), end: range.getPoint(1) } : null;
  }

  public captureMergedRanges(range: SheetRangeBounds): readonly SheetClipboardMergedRange[] {
    const matrix = readSheetCellMerges(this.#dataEngine);
    if (!matrix) return [];
    return matrix.getRanges().flatMap((merge) => {
      const start = merge.getPoint(0);
      const end = merge.getPoint(1);
      if (end[0] < range.start[0] || start[0] > range.end[0] || end[1] < range.start[1] || start[1] > range.end[1])
        return [];
      if (start[0] < range.start[0] || start[1] < range.start[1] || end[0] > range.end[0] || end[1] > range.end[1]) {
        throw new SheetClipboardError(
          SheetClipboardErrorCode.SourceIntersectsMergedCells,
          'Clipboard selection includes only part of a merged cell.',
          { range, merge: { start, end } },
        );
      }
      return [
        {
          start: [start[0] - range.start[0], start[1] - range.start[1]] as const,
          end: [end[0] - range.start[0], end[1] - range.start[1]] as const,
        },
      ];
    });
  }

  public planPasteMergedRanges(merges: readonly SheetClipboardMergedRange[], target: SheetClipboardCellPoint) {
    const matrix = readSheetCellMerges(this.#dataEngine);
    if (!matrix)
      throw new SheetClipboardError(SheetClipboardErrorCode.InvalidPayload, 'This sheet has no merge owner.');
    const source = { target: SheetCellMergePlugin.pluginKey, readMatrix: () => matrix };
    return {
      target: source.target,
      operations: merges.flatMap((merge) =>
        createMergeCellsOperations(
          {
            anchor: [target[0] + merge.start[0], target[1] + merge.start[1]],
            focus: [target[0] + merge.end[0], target[1] + merge.end[1]],
          },
          source,
        ),
      ),
    };
  }

  public planClearMergedRanges(range: SheetRangeBounds) {
    const matrix = readSheetCellMerges(this.#dataEngine);
    const target = SheetCellMergePlugin.pluginKey;
    if (!matrix) return { target, operations: [] };
    const source = { target, readMatrix: () => matrix };
    const merges = this.captureMergedRanges(range);
    return {
      target,
      operations: merges.flatMap((merge) =>
        createUnmergeCellsOperations(
          {
            anchor: [range.start[0] + merge.start[0], range.start[1] + merge.start[1]],
            focus: [range.start[0] + merge.end[0], range.start[1] + merge.end[1]],
          },
          source,
        ),
      ),
    };
  }
}
