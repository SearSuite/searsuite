import { Injectable } from '@searsuite/sear-foundation-di';
import { SheetClipboard, type SheetClipboardPayload } from './SheetClipboardContracts';

// Clipboard contents model the host clipboard, which is shared by all
// mounted sheet editors (including workbook sheet remounts).
let clipboardPayload: SheetClipboardPayload | null = null;

/** Node-safe clipboard used when a host does not expose system clipboard I/O. */
@Injectable()
export class InMemorySheetClipboard extends SheetClipboard {
  public async read(): Promise<SheetClipboardPayload | null> {
    return clipboardPayload;
  }

  public async write(payload: SheetClipboardPayload): Promise<void> {
    clipboardPayload = payload;
  }
}
