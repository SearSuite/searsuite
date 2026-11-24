import { Pipeline } from '@searsuite/sear-assembly-core';
import { createSheetTransaction, type SheetCommand, type SheetCommandContext } from '@searsuite/sear-assembly-commands';
import type { SheetClipboardCodec, SheetClipboardDataSource } from './SheetClipboardContracts';
import { CutRangeCommand, type SheetClipboardCommandResult, type SheetCopyRangeInput } from './SheetClipboardCommands';
import { resolveRange } from './SheetClipboardCommandHelpers';
import { createClearFormatOperations, createClearOperations } from './SheetClipboardOperations';
import { SheetClipboardError, SheetClipboardErrorCode } from './SheetClipboardErrors';

export class CutRangeSheetCommand implements SheetCommand<SheetClipboardCommandResult> {
  readonly #source: SheetClipboardDataSource;
  readonly #codec: SheetClipboardCodec;
  readonly #input: SheetCopyRangeInput | void;

  public readonly id = CutRangeCommand.id;

  public constructor(
    source: SheetClipboardDataSource,
    codec: SheetClipboardCodec,
    input: SheetCopyRangeInput | void,
  ) {
    this.#source = source;
    this.#codec = codec;
    this.#input = input;
  }

  public execute(_context: SheetCommandContext): SheetClipboardCommandResult {
    const range = resolveRange(this.#input?.range, this.#source);
    if (this.#source.validateCutCell) {
      for (let row = range.start[0]; row <= range.end[0]; row++) {
        for (let column = range.start[1]; column <= range.end[1]; column++) {
          if (!this.#source.readCell(row, column) && !this.#source.readCopyCell?.(row, column)) continue;
          const result = this.#source.validateCutCell(row, column);
          if (result.reject) throw new SheetClipboardError(SheetClipboardErrorCode.InputRejected,
            result.message ?? 'Cut source is protected.', { source: [row, column] });
        }
      }
    }
    const encoded = this.#codec.encode(range, this.#source);
    const cutId = this.#source.createClipboardCutId?.();
    const payload = encoded.structured
      ? { ...encoded, structured: { ...encoded.structured, isCut: true as const, ...(cutId ? { cutId } : {}) } }
      : encoded;
    if (cutId && this.#source.prepareCrossSheetCut) {
      const clear = new Pipeline(`${this.id}.preview`)
        .addTransaction(this.id, createSheetTransaction(this.#source.target, createClearOperations(range, this.#source)))
        .addTransaction(`${this.id}.formats`, createSheetTransaction(
          this.#source.formatTarget, createClearFormatOperations(range, this.#source),
        ));
      this.#source.clearOwnerFormats?.(range).forEach(({ target, operations }, index) => {
        if (operations.length && target !== this.#source.target)
          clear.addTransaction(`${this.id}.ownerFormat.${index}`, createSheetTransaction(target, [...operations]));
      });
      this.#source.clearOwnerData?.(range).forEach(({ target, operations }, index) => {
        if (operations.length) clear.addTransaction(
          `${this.id}.ownerData.${index}`, createSheetTransaction(target, [...operations]));
      });
      const merges = this.#source.planClearMergedRanges?.(range);
      if (merges?.operations.length)
        clear.addTransaction(`${this.id}.merges`, createSheetTransaction(merges.target, [...merges.operations]));
      this.#source.prepareCrossSheetCut(cutId, clear);
    }
    if (cutId && this.#source.cutSourceId) this.#source.cutSession?.begin({
      id: cutId,
      sourceId: this.#source.cutSourceId,
      range,
    });
    return {
      pipeline: new Pipeline(this.id),
      range,
      payload,
    };
  }
}
