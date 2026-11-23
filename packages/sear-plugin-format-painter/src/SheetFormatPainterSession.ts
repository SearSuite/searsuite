import { type SheetFormatTransferRegistry, type SheetFormatTransferSnapshot } from '@searsuite/sear-assembly-plugin';
import { type FormatPainterState } from './FormatPainterProtocol';

/** Local brush state borrowed by Sheet editors mounted within one Workbook. */
export class SheetFormatPainterSession {
  public static readonly symbol = Symbol.for('SheetFormatPainterSession');
  #snapshot: SheetFormatTransferSnapshot | null = null;
  #sourceFormats: SheetFormatTransferRegistry | null = null;
  #state: FormatPainterState = Object.freeze({ mode: null, source: null });

  public get snapshot(): SheetFormatTransferSnapshot | null { return this.#snapshot; }
  public get state(): FormatPainterState { return this.#state; }

  public visibleState(formats: SheetFormatTransferRegistry): FormatPainterState {
    return this.#sourceFormats === formats
      ? this.#state
      : { mode: this.#state.mode, source: null };
  }

  public start(
    formats: SheetFormatTransferRegistry,
    snapshot: SheetFormatTransferSnapshot,
    state: FormatPainterState,
  ): void {
    this.#sourceFormats = formats;
    this.#snapshot = snapshot;
    this.#state = state;
  }

  public clear(): void {
    this.#sourceFormats = null;
    this.#snapshot = null;
    this.#state = Object.freeze({ mode: null, source: null });
  }
}
