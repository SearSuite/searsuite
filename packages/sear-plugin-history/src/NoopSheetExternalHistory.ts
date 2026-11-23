import { SheetExternalHistory, type SheetExternalHistoryStatus } from './SheetExternalHistory';

export class NoopSheetExternalHistory extends SheetExternalHistory {
  public getStatus(): SheetExternalHistoryStatus {
    return { canUndo: false, canRedo: false };
  }

  public subscribe(): () => void {
    return () => void 0;
  }

  public undo(): void {}
  public redo(): void {}
}
