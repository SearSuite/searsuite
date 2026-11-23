import { Pipeline } from '@searsuite/sear-assembly-core';
import { createSheetTransaction, type SheetCommand, type SheetCommandContext } from '@searsuite/sear-assembly-commands';
import type { CellFormat } from '@searsuite/sear-domain-cell-types';
import type {
  SheetClipboardCodec,
  SheetClipboardDataSource,
  SheetClipboardDecodeContext,
  SheetClipboardDecodedRange,
  SheetClipboardDecodedRow,
} from './SheetClipboardContracts';
import { PasteRangeCommand, type SheetPasteRangeInput, type SheetPasteRangeResult } from './SheetClipboardCommands';
import { assertPasteBounds, resolvePasteTarget, resolveRange } from './SheetClipboardCommandHelpers';
import { assertClipboardMergedRanges, assertPasteMergeTarget } from './SheetClipboardValidation';
import { SheetClipboardError, SheetClipboardErrorCode } from './SheetClipboardErrors';
import { createPasteFormatOperations, createPasteOperations } from './SheetClipboardOperations';
import { SheetPasteMode } from './SheetPasteMode';

export class PasteRangeSheetCommand implements SheetCommand<SheetPasteRangeResult> {
  public readonly id = PasteRangeCommand.id;

  public constructor(
    private readonly source: SheetClipboardDataSource,
    private readonly codec: SheetClipboardCodec,
    private readonly input: SheetPasteRangeInput,
  ) {}

  public execute(_context: SheetCommandContext): SheetPasteRangeResult {
    const target = resolvePasteTarget(this.input.target, this.source);
    const mode = this.input.mode ?? SheetPasteMode.All;
    const decoded = this.expandToSelection(
      target,
      this.codec.decode(this.input.payload, { target, valuesOnly: mode === SheetPasteMode.Values } satisfies SheetClipboardDecodeContext),
    );
    assertPasteBounds(target, decoded.rows, this.source);
    if (decoded.merges) assertClipboardMergedRanges(decoded.merges, decoded.rows);
    assertPasteMergeTarget(target, decoded.rows, this.source, mode === SheetPasteMode.All ? decoded.merges : undefined);
    if (mode !== SheetPasteMode.Formats && this.source.validatePasteCell) {
      decoded.rows.forEach((row, rowOffset) => row.forEach((cell, columnOffset) => {
        const destination: [number, number] = [target[0] + rowOffset, target[1] + columnOffset];
        const result = this.source.validatePasteCell!(destination[0], destination[1], cell);
        if (result.reject) throw new SheetClipboardError(SheetClipboardErrorCode.InputRejected,
          result.message ?? 'Pasted value was rejected by cell validation.', { destination, ruleId: result.ruleId });
      }));
    }
    if (mode === SheetPasteMode.All && decoded.merges?.length && !this.source.planPasteMergedRanges) {
      throw new SheetClipboardError(SheetClipboardErrorCode.InvalidPayload, 'This sheet cannot paste merged cells.');
    }
    const pending = this.source.cutSession?.getPending();
    const cutId = this.input.payload.structured?.cutId;
    if (mode === SheetPasteMode.All && cutId && pending?.id === cutId &&
      pending.sourceId === this.source.cutSourceId && this.source.planRangeMove) {
      const destination = {
        start: target,
        end: [target[0] + decoded.rows.length - 1,
          target[1] + decoded.rows.reduce((width, row) => Math.max(width, row.length), 0) - 1] as [number, number],
      };
      const pipeline = new Pipeline(this.id);
      this.source.planRangeMove(pending.range, destination).forEach(({ target: owner, operations }, index) => {
        if (operations.length) pipeline.addTransaction(
          `${this.id}.move.${index}`,
          createSheetTransaction(owner, [...operations]),
        );
      });
      pipeline.addPostCommit(`${this.id}.completeCut`, () => this.source.cutSession?.cancel());
      return { pipeline, range: destination };
    }
    const pipeline = new Pipeline(this.id);
    if (mode !== SheetPasteMode.Formats) {
      pipeline.addTransaction(
        this.id,
        createSheetTransaction(this.source.target, createPasteOperations(target, decoded.rows, this.source)),
      );
    }
    if (mode !== SheetPasteMode.Values && decoded.formats) {
      pipeline.addTransaction(
        `${this.id}.formats`,
        createSheetTransaction(
          this.source.formatTarget,
          createPasteFormatOperations(target, decoded.formats, this.source),
        ),
      );
    }
    if (mode !== SheetPasteMode.Values && decoded.ownerFormats && this.source.planOwnerFormats) {
      const range: { start: [number, number]; end: [number, number] } = {
        start: target,
        end: [target[0] + decoded.rows.length - 1, target[1] + Math.max(...decoded.rows.map((row) => row.length)) - 1],
      };
      const ownerPlans = this.source.planOwnerFormats(decoded.ownerFormats, range);
      ownerPlans.forEach(({ target: owner, operations }, index) => {
        if (operations.length && (mode === SheetPasteMode.Formats || owner !== this.source.target)) pipeline.addTransaction(
          `${this.id}.ownerFormat.${index}`,
          createSheetTransaction(owner, [...operations]),
        );
      });
    }
    if (mode !== SheetPasteMode.Values && decoded.ownerFormatsByRow && this.source.planOwnerFormats) {
      decoded.ownerFormatsByRow.forEach((captured, rowOffset) => {
        const rowRange = {
          start: [target[0] + rowOffset, target[1]] as [number, number],
          end: [target[0] + rowOffset, target[1] + (decoded.rows[rowOffset]?.length ?? 0) - 1] as [number, number],
        };
        this.source.planOwnerFormats!(captured, rowRange).forEach(({ target: owner, operations }, index) => {
          if (operations.length && (mode === SheetPasteMode.Formats || owner !== this.source.target)) pipeline.addTransaction(
            `${this.id}.rowOwnerFormat.${rowOffset}.${index}`,
            createSheetTransaction(owner, [...operations]),
          );
        });
      });
    }
    if (mode === SheetPasteMode.All && decoded.ownerDataInstances && this.source.planOwnerData) {
      const requests = decoded.ownerDataInstances.map(({ offset, size, captured }) => ({
        captured,
        destination: {
          start: [target[0] + offset[0], target[1] + offset[1]] as [number, number],
          end: [target[0] + offset[0] + size[0] - 1, target[1] + offset[1] + size[1] - 1] as [number, number],
        },
      }));
      this.source.planOwnerData(requests).forEach(({ target: owner, operations }, index) => {
        if (operations.length) pipeline.addTransaction(
          `${this.id}.ownerData.${index}`,
          createSheetTransaction(owner, [...operations]),
        );
      });
    }
    if (mode === SheetPasteMode.All && decoded.merges?.length) {
      const mergePlan = this.source.planPasteMergedRanges!(decoded.merges, target);
      if (mergePlan.operations.length) pipeline.addTransaction(
        `${this.id}.merges`,
        createSheetTransaction(mergePlan.target, [...mergePlan.operations]),
      );
    }
    if (mode === SheetPasteMode.All && cutId && pending?.id === cutId &&
      pending.sourceId !== this.source.cutSourceId && this.source.scheduleCrossSheetMove) {
      return {
        pipeline: new Pipeline(this.id),
        completion: this.source.scheduleCrossSheetMove(cutId, pending.sourceId, pipeline),
        workbookMove: true,
        range: {
          start: target,
          end: [target[0] + decoded.rows.length - 1,
            target[1] + decoded.rows.reduce((width, row) => Math.max(width, row.length), 0) - 1],
        },
      };
    }
    return {
      pipeline,
      range: {
        start: target,
        end: [
          target[0] + decoded.rows.length - 1,
          target[1] + decoded.rows.reduce((width, row) => Math.max(width, row.length), 0) - 1,
        ],
      },
    };
  }

  private expandToSelection(target: [number, number], decoded: SheetClipboardDecodedRange): SheetClipboardDecodedRange {
    if (this.input.payload.structured?.isCut) return decoded;
    if (this.input.target) return decoded;
    const selection = this.source.getSelection();
    if (!selection) return decoded;
    const range = resolveRange(selection, this.source);
    const sourceHeight = decoded.rows.length;
    const sourceWidth = decoded.rows[0]?.length ?? 0;
    const targetHeight = range.end[0] - range.start[0] + 1;
    const targetWidth = range.end[1] - range.start[1] + 1;
    if (
      sourceHeight === 0 || sourceWidth === 0 ||
      decoded.rows.some((row) => row.length !== sourceWidth) ||
      targetHeight < sourceHeight || targetWidth < sourceWidth ||
      targetHeight % sourceHeight !== 0 || targetWidth % sourceWidth !== 0 ||
      (targetHeight === sourceHeight && targetWidth === sourceWidth)
    ) return decoded;

    const rows: Array<Array<SheetClipboardDecodedRow[number]>> = Array.from({ length: targetHeight }, () =>
      Array.from({ length: targetWidth }, () => null),
    );
    const formats: Array<Array<CellFormat | null>> | undefined = decoded.formats
      ? Array.from({ length: targetHeight }, () => Array.from({ length: targetWidth }, () => null))
      : undefined;
    const ownerFormatsByRow = decoded.ownerFormatsByRow
      ? Array.from({ length: targetHeight }, () => [] as NonNullable<SheetClipboardDecodedRange['ownerFormatsByRow']>[number])
      : undefined;
    const merges = [] as NonNullable<SheetClipboardDecodedRange['merges']>[number][];
    const ownerDataInstances = [] as NonNullable<SheetClipboardDecodedRange['ownerDataInstances']>[number][];
    for (let rowOffset = 0; rowOffset < targetHeight; rowOffset += sourceHeight) {
      for (let columnOffset = 0; columnOffset < targetWidth; columnOffset += sourceWidth) {
        const tile = rowOffset === 0 && columnOffset === 0
          ? decoded
          : this.codec.decode(this.input.payload, {
              target: [target[0] + rowOffset, target[1] + columnOffset],
            });
        tile.rows.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
          rows[rowOffset + rowIndex]![columnOffset + columnIndex] = cell;
        }));
        tile.formats?.forEach((row, rowIndex) => row.forEach((format, columnIndex) => {
          formats![rowOffset + rowIndex]![columnOffset + columnIndex] = format;
        }));
        tile.ownerFormatsByRow?.forEach((captured, rowIndex) => {
          ownerFormatsByRow![rowOffset + rowIndex] = captured;
        });
        tile.merges?.forEach((merge) => merges.push({
          start: [merge.start[0] + rowOffset, merge.start[1] + columnOffset],
          end: [merge.end[0] + rowOffset, merge.end[1] + columnOffset],
        }));
        tile.ownerDataInstances?.forEach((instance) => ownerDataInstances.push({
          ...instance,
          offset: [instance.offset[0] + rowOffset, instance.offset[1] + columnOffset],
        }));
      }
    }
    return {
      rows,
      ...(formats ? { formats } : {}),
      ...(decoded.ownerFormats ? { ownerFormats: decoded.ownerFormats } : {}),
      ...(ownerFormatsByRow ? { ownerFormatsByRow } : {}),
      ...(ownerDataInstances.length ? { ownerDataInstances } : {}),
      ...(decoded.merges ? { merges } : {}),
    };
  }
}
