import { Injectable } from '@searsuite/sear-foundation-di';
import { SheetClipboard, type SheetClipboardPayload } from './SheetClipboardContracts';

/** Node-safe clipboard used when a host does not expose system clipboard I/O. */
@Injectable()
export class InMemorySheetClipboard extends SheetClipboard {
  // Clipboard contents model the host clipboard, which is shared by all
  // mounted sheet editors (including workbook sheet remounts).
  private static payload: SheetClipboardPayload | null = null;

  public async read(): Promise<SheetClipboardPayload | null> {
    return InMemorySheetClipboard.payload;
  }

  public async write(payload: SheetClipboardPayload): Promise<void> {
    InMemorySheetClipboard.payload = payload;
  }
}
