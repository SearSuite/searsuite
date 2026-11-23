import { SearError } from '@searsuite/sear-foundation-error';
import type { SheetEditorPoint, SheetEmbeddedEditorContext } from '@searsuite/sear-sheet-editor-contract';
import type {
  SheetEmbeddedEditorPlugin,
  SheetEmbeddedEditorPluginContext,
} from '../embeddedEditor/SheetEmbeddedEditorPlugin';

/** Adapts Sheet cell geometry and pointer coordinates for embedded sessions. */
export class SheetCellContextPlugin implements SheetEmbeddedEditorPlugin {
  public readonly key = 'sheet.cell-context';

  public initialize(context: SheetEmbeddedEditorPluginContext): void {
    this.assertGeometry(context.editor);
  }

  public toLocalPoint(context: SheetEmbeddedEditorContext, point: SheetEditorPoint): SheetEditorPoint {
    return context.geometry.toLocalPoint(point);
  }

  public toSheetPoint(context: SheetEmbeddedEditorContext, point: SheetEditorPoint): SheetEditorPoint {
    return context.geometry.toSheetPoint(point);
  }

  private assertGeometry(context: SheetEmbeddedEditorContext): void {
    const { cellRect } = context.geometry;
    if (![cellRect.x, cellRect.y, cellRect.width, cellRect.height].every(Number.isFinite)) {
      throw new SearError('Sheet embedded editor requires finite cell geometry.');
    }
  }
}
