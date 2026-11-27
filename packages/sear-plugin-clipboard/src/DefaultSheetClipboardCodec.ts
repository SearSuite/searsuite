import { type SheetRangeBounds } from '@searsuite/sear-assembly-commands';
import { CellClipboardCodecRegistry } from '@searsuite/sear-domain-cell-types';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import {
  SHEET_CLIPBOARD_PAYLOAD_VERSION,
  type SheetClipboardCodec,
  type SheetClipboardDataSource,
  type SheetClipboardDecodeContext,
  type SheetClipboardDecodedRange,
  type SheetClipboardPayload,
  type SheetClipboardRow,
} from './SheetClipboardContracts';
import { SheetClipboardError, SheetClipboardErrorCode } from './SheetClipboardErrors';
import { decodeSheetClipboardText, encodeSheetClipboardText } from './SheetClipboardDelimitedText';

/** Default codec that delegates cell serialization to the cell-type registry. */
@Injectable()
export class DefaultSheetClipboardCodec implements SheetClipboardCodec {
  readonly #cellCodecs: CellClipboardCodecRegistry;

  public constructor(
    @Inject(CellClipboardCodecRegistry.symbol)
    cellCodecs: CellClipboardCodecRegistry,
  ) {
    this.#cellCodecs = cellCodecs;
  }

  public encode(
    range: SheetRangeBounds,
    source: SheetClipboardDataSource,
    visibleRowsOnly = false,
  ): SheetClipboardPayload {
    const sourceRows: number[] = [];
    for (let row = range.start[0]; row <= range.end[0]; row++) {
      if (!visibleRowsOnly || source.isRowVisible?.(row) !== false) sourceRows.push(row);
    }
    if (sourceRows.length === 0) {
      throw new SheetClipboardError(
        SheetClipboardErrorCode.NoVisibleRows,
        'Clipboard selection contains no visible rows.',
        { range },
      );
    }
    const compacted = sourceRows.length !== range.end[0] - range.start[0] + 1;
    const rows: SheetClipboardRow[] = [];
    const valueRows: SheetClipboardRow[] = [];
    const plainTextRows: string[][] = [];
    const formats = [] as Array<Array<ReturnType<SheetClipboardDataSource['readCellFormat']>>>;
    for (const row of sourceRows) {
      const cells: SheetClipboardRow[number][] = [];
      const valueCells: SheetClipboardRow[number][] = [];
      const plainTextCells: string[] = [];
      const formatCells: Array<ReturnType<SheetClipboardDataSource['readCellFormat']>> = [];
      for (let column = range.start[1]; column <= range.end[1]; column++) {
        const cell = source.readCopyCell?.(row, column) ?? source.readCell(row, column);
        const valueCell = source.readCopyValueCell ? source.readCopyValueCell(row, column) : cell;
        cells.push(cell ? this.#cellCodecs.encode(cell) : null);
        valueCells.push(valueCell ? this.#cellCodecs.encode(valueCell) : null);
        plainTextCells.push(valueCell ? this.#cellCodecs.toPlainText(valueCell) : '');
        formatCells.push(source.readCellFormat(row, column));
      }
      rows.push(cells);
      valueRows.push(valueCells);
      plainTextRows.push(plainTextCells);
      formats.push(formatCells);
    }
    return {
      plainText: encodeSheetClipboardText(plainTextRows),
      structured: {
        kind: 'searsuite.sheet-range',
        version: SHEET_CLIPBOARD_PAYLOAD_VERSION,
        source: range.start,
        ...(compacted ? { sourceRows } : {}),
        rows,
        valueRows,
        formats,
        ...(source.captureOwnerFormats
          ? compacted
            ? {
                ownerFormatsByRow: sourceRows.map((row) =>
                  source.captureOwnerFormats!({
                    start: [row, range.start[1]],
                    end: [row, range.end[1]],
                  }),
                ),
              }
            : { ownerFormats: source.captureOwnerFormats(range) }
          : {}),
        ...(source.captureOwnerData
          ? compacted
            ? {
                ownerDataByRow: sourceRows.map((row) =>
                  source.captureOwnerData!({
                    start: [row, range.start[1]],
                    end: [row, range.end[1]],
                  }),
                ),
              }
            : { ownerData: source.captureOwnerData(range) }
          : {}),
        ...(source.captureMergedRanges
          ? {
              merges: compacted
                ? sourceRows.flatMap((row, compactedRow) =>
                    source.captureMergedRanges!({
                      start: [row, range.start[1]],
                      end: [row, range.end[1]],
                    }).map((merge) => ({
                      start: [compactedRow, merge.start[1]] as const,
                      end: [compactedRow, merge.end[1]] as const,
                    })),
                  )
                : source.captureMergedRanges(range),
            }
          : {}),
      },
    };
  }

  public decode(payload: SheetClipboardPayload, context: SheetClipboardDecodeContext): SheetClipboardDecodedRange {
    const structured = payload.structured;
    if (
      structured &&
      structured.kind === 'searsuite.sheet-range' &&
      structured.version === SHEET_CLIPBOARD_PAYLOAD_VERSION &&
      Array.isArray(structured.rows)
    ) {
      const source = normalizePoint(structured.source) ?? context.target;
      const sourceRows =
        Array.isArray(structured.sourceRows) &&
        structured.sourceRows.length === structured.rows.length &&
        structured.sourceRows.every((row) => Number.isInteger(row) && row >= 0)
          ? structured.sourceRows
          : undefined;
      const ownerFormatsByRow =
        Array.isArray(structured.ownerFormatsByRow) &&
        structured.ownerFormatsByRow.length === structured.rows.length &&
        structured.ownerFormatsByRow.every(Array.isArray)
          ? structured.ownerFormatsByRow
          : undefined;
      const ownerDataByRow =
        Array.isArray(structured.ownerDataByRow) &&
        structured.ownerDataByRow.length === structured.rows.length &&
        structured.ownerDataByRow.every(Array.isArray)
          ? structured.ownerDataByRow
          : undefined;
      const ownerDataInstances = ownerDataByRow
        ? ownerDataByRow.map((captured, rowIndex) => ({
            offset: [rowIndex, 0] as const,
            size: [1, structured.rows[rowIndex]?.length ?? 0] as const,
            captured,
          }))
        : Array.isArray(structured.ownerData)
        ? [
            {
              offset: [0, 0] as const,
              size: [structured.rows.length, structured.rows[0]?.length ?? 0] as const,
              captured: structured.ownerData,
            },
          ]
        : undefined;
      const columnDelta = structured.isCut ? 0 : context.target[1] - source[1];
      const rows =
        context.valuesOnly &&
        Array.isArray(structured.valueRows) &&
        structured.valueRows.length === structured.rows.length &&
        structured.valueRows.every(Array.isArray)
          ? structured.valueRows
          : structured.rows;
      return {
        rows: rows.map((row, rowIndex) =>
          row.map((cell: SheetClipboardRow[number]) =>
            cell
              ? this.#cellCodecs.decode(cell, {
                  rowDelta: structured.isCut
                    ? 0
                    : context.target[0] + rowIndex - (sourceRows?.[rowIndex] ?? source[0] + rowIndex),
                  columnDelta,
                })
              : null,
          ),
        ),
        formats: structured.formats,
        ...(structured.ownerFormats ? { ownerFormats: structured.ownerFormats } : {}),
        ...(ownerFormatsByRow ? { ownerFormatsByRow } : {}),
        ...(ownerDataInstances ? { ownerDataInstances } : {}),
        ...(structured.merges ? { merges: structured.merges } : {}),
      };
    }
    const rows = decodeSheetClipboardText(payload.plainText).map((row) =>
      row.map((text) => this.#cellCodecs.decodePlainText(text)),
    );
    return { rows };
  }
}

function normalizePoint(point: unknown): [number, number] | null {
  if (!Array.isArray(point) || point.length !== 2 || !Number.isInteger(point[0]) || !Number.isInteger(point[1])) {
    return null;
  }
  return [point[0], point[1]];
}
