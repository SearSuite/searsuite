import { Pipeline } from '@searsuite/sear-assembly-core';
import type { SheetCommand, SheetCommandContext } from '@searsuite/sear-assembly-commands';
import type { SheetClipboardCodec, SheetClipboardDataSource } from './SheetClipboardContracts';
import { CopyRangeCommand, type SheetClipboardCommandResult, type SheetCopyRangeInput } from './SheetClipboardCommands';
import { resolveRange } from './SheetClipboardCommandHelpers';

export class CopyRangeSheetCommand implements SheetCommand<SheetClipboardCommandResult> {
  public readonly id = CopyRangeCommand.id;

  public constructor(
    private readonly source: SheetClipboardDataSource,
    private readonly codec: SheetClipboardCodec,
    private readonly input: SheetCopyRangeInput | void,
  ) {}

  public execute(_context: SheetCommandContext): SheetClipboardCommandResult {
    const range = resolveRange(this.input?.range, this.source);
    this.source.cutSession?.cancel();
    return { pipeline: new Pipeline(this.id), range, payload: this.codec.encode(range, this.source, true) };
  }
}
