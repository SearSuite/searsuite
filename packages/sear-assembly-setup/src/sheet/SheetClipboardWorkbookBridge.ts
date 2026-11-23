import type { SheetDocumentState } from './SheetEditorContracts';

/** Workbook-owned endpoint for an atomic move between two sheets. */
export interface SheetClipboardWorkbookBridge {
  prepareCut(cutId: string, sourceId: string, sourceBefore: SheetDocumentState, clearedSource: SheetDocumentState): void;
  commitMove(cutId: string, sourceId: string, targetId: string, targetAfter: SheetDocumentState): Promise<void>;
}

export const SheetClipboardWorkbookBridgeSymbol = Symbol.for('SheetClipboardWorkbookBridge');
