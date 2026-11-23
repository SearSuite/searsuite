import { createSheetTransaction, defineSheetCommand, PipelineExecutionCommand, type SheetCommandBus, type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-core';
import { type SheetClipboardTransferRegistry, type SheetFormatTransferRegistry, type SheetFormatTransferSnapshot, type SheetClipboardTransferRequest, type PluginKey } from '@searsuite/sear-assembly-plugin';
import { type CellMatrixElement, ReadSheetCellDataQuery, SheetDataPlugin, type SheetRowVisibility } from '@searsuite/sear-render-engine';
import { createUpdateCellOTOperation, MatrixCellUpdateIntent, OTClone, type Operation } from '@searsuite/sear-domain-ot';
import { SearError } from '@searsuite/sear-foundation-error';
import { type CellClipboardCodecRegistry, type SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
import { type CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { inferSheetFillSeries } from './SheetFillSeries';

export interface SheetFillRangeInput {
  readonly source: { readonly start: readonly [number, number]; readonly end: readonly [number, number] };
  readonly target: readonly [number, number];
  /** Exact copy keeps the source cell's formula text unchanged. */
  readonly mode?: 'fill' | 'exact';
}

/** Fills cells from a selected source rectangle through the pointer destination. */
export const FillSheetRangeCommand = defineSheetCommand<SheetFillRangeInput>('sheet.selection.fillRange');

export function registerSheetFillRangeCommand(
  commands: SheetCommandBus, queries: SheetQueryRegistry, validation: SheetCellInputValidationRegistry,
  codecs: CellClipboardCodecRegistry,
  readMerges?: () => CellMergeMatrix | null,
  readRowVisibility?: () => SheetRowVisibility | null,
  formats?: SheetFormatTransferRegistry,
  ownerData?: SheetClipboardTransferRegistry,
): void {
  commands.register(FillSheetRangeCommand, (input) => {
    const cells = queries.run(ReadSheetCellDataQuery, void 0);
    const { source, target } = input;
    const startRow = Math.min(source.start[0], target[0]);
    const endRow = Math.max(source.end[0], target[0]);
    const startCol = Math.min(source.start[1], target[1]);
    const endCol = Math.max(source.end[1], target[1]);
    if (startRow < 0 || startCol < 0 || endRow >= cells.shape[0] || endCol >= cells.shape[1])
      throw new SearError('Fill range is outside the Sheet bounds.');
    const intersectsMerge = readMerges?.()?.getRanges().some((range) => {
      const first = range.getPoint(0);
      const last = range.getPoint(1);
      return first[0] <= endRow && last[0] >= startRow && first[1] <= endCol && last[1] >= startCol;
    });
    if (intersectsMerge) throw new SearError('Cannot fill a range containing merged cells.');
    const sourceHeight = source.end[0] - source.start[0] + 1;
    const sourceWidth = source.end[1] - source.start[1] + 1;
    const modulo = (value: number, size: number) => ((value % size) + size) % size;
    const singleStep = input.mode === 'exact' || sourceHeight !== 1 || sourceWidth !== 1
      ? null : formats?.singleCellFillStep(source.start[0], source.start[1]) ?? null;
    const seriesAxis = input.mode === 'exact' ? null
      : sourceWidth === 1 && sourceHeight >= 2 && target[1] === source.end[1] ? 'row'
        : sourceHeight === 1 && sourceWidth >= 2 && target[0] === source.end[0] ? 'column'
          : singleStep != null && target[1] === source.start[1] && target[0] !== source.start[0] ? 'row'
            : singleStep != null && target[0] === source.start[0] && target[1] !== source.start[1] ? 'column'
          : null;
    const seriesSource = seriesAxis === 'row'
      ? Array.from({ length: sourceHeight }, (_, index) => cells.getItem(source.start[0] + index, source.start[1]))
      : seriesAxis === 'column'
        ? Array.from({ length: sourceWidth }, (_, index) => cells.getItem(source.start[0], source.start[1] + index))
        : [];
    const series = inferSheetFillSeries(seriesSource, singleStep ?? undefined);
    const rowVisibility = readRowVisibility?.();
    const operations = [];
    const sourceFormats = new Map<string, SheetFormatTransferSnapshot>();
    const sourceOwnerData = new Map<string, ReturnType<SheetClipboardTransferRegistry['capturePortable']>>();
    const formatOperations = new Map<PluginKey, Operation[]>();
    const ownerDataRequests: SheetClipboardTransferRequest[] = [];
    for (let row = startRow; row <= endRow; row += 1) {
      if (rowVisibility?.active && rowVisibility.isRowFiltered(row)) continue;
      for (let col = startCol; col <= endCol; col += 1) {
        if (row >= source.start[0] && row <= source.end[0] && col >= source.start[1] && col <= source.end[1]) continue;
        const sourceRow = source.start[0] + modulo(row - source.start[0], sourceHeight);
        const sourceCol = source.start[1] + modulo(col - source.start[1], sourceWidth);
        const sourceValue = cells.getItem(sourceRow, sourceCol);
        const value = series && seriesAxis
          ? { ...OTClone(sourceValue!), value: series.valueAt(seriesAxis === 'row'
            ? row - source.start[0] : col - source.start[1]) }
          : sourceValue;
        const cloned = value ? OTClone(value) : null;
        const copied = cloned && !series && input.mode !== 'exact'
          ? codecs.get(cloned.type)?.rebase?.(cloned, {
            rowDelta: row - sourceRow, columnDelta: col - sourceCol,
          }) ?? cloned
          : cloned;
        const result = validation.validate(row, col, copied?.value == null ? '' : String(copied.value));
        if (result.reject) throw new SearError(result.message ?? 'Fill value was rejected by cell validation.',
          { destination: [row, col], ruleId: result.ruleId });
        operations.push(createUpdateCellOTOperation<CellMatrixElement>(
          [row, col], copied, cells.getItem(row, col),
          formats ? MatrixCellUpdateIntent.Relocation : undefined,
        ));
        const sourceKey = `${sourceRow}:${sourceCol}`;
        const destination = { start: [row, col] as [number, number], end: [row, col] as [number, number] };
        if (formats) {
          let captured = sourceFormats.get(sourceKey);
          if (!captured) {
            captured = formats.capture({ start: [sourceRow, sourceCol], end: [sourceRow, sourceCol] });
            sourceFormats.set(sourceKey, captured);
          }
          for (const plan of captured.plan(destination)) {
            const planned = formatOperations.get(plan.target) ?? [];
            planned.push(...plan.operations);
            formatOperations.set(plan.target, planned);
          }
        }
        if (ownerData) {
          let captured = sourceOwnerData.get(sourceKey);
          if (!captured) {
            captured = ownerData.capturePortable({ start: [sourceRow, sourceCol], end: [sourceRow, sourceCol] });
            sourceOwnerData.set(sourceKey, captured);
          }
          ownerDataRequests.push({ captured, destination });
        }
      }
    }
    const pipeline = new Pipeline(FillSheetRangeCommand.id);
    if (operations.length) pipeline.addTransaction('fillRange.values', createSheetTransaction(SheetDataPlugin.pluginKey, operations));
    for (const [owner, planned] of formatOperations) {
      if (planned.length) pipeline.addTransaction('fillRange.formats', createSheetTransaction(owner, planned));
    }
    for (const plan of ownerData?.planPortable(ownerDataRequests) ?? []) {
      if (plan.operations.length) pipeline.addTransaction('fillRange.ownerData',
        createSheetTransaction(plan.target, [...plan.operations]));
    }
    return new PipelineExecutionCommand(FillSheetRangeCommand.id, pipeline);
  });
}
