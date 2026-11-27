import { createSheetEditorHarness } from './support/SheetEditorHarness';
import {
  OpenCellEditorCommand,
  HandleDocumentInputCommand,
  CancelCellEditCommand,
  IsCellEditingQuery,
  SheetFormulaBarObservation,
  FormulaInputAssistObservation,
} from '@searsuite/sear-plugin-cell-editor';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import { ResizeSheetViewportCommand } from '../src';
import { CellRegion } from '@searsuite/sear-render-registry';
import { RequestCellEditorRenderCommand, SheetSelectionView } from '@searsuite/sear-render';

function click(row: number, column: number, x = 160, y = 60) {
  return {
    target: { properties: { region: CellRegion.Grid, startRowIndex: row, startColIndex: column } },
    origin: { offsetX: x, offsetY: y, button: 0, preventDefault: jest.fn() },
  } as never;
}

describe('cell editor presentation lifecycle', () => {
  it('lets the selection view consume a fill-handle double click before editing', () => {
    const h = createSheetEditorHarness();
    try {
      const selection = h.container.resolve<SheetSelectionView>(SheetSelectionView.symbol);
      const fill = jest.spyOn(selection, 'onFillHandleDoubleClick').mockReturnValue(true);
      const event = click(1, 1);
      expect(h.view.onMouseDown(h.core, { ...(event as object), clickCount: 2 } as never)).toBe(false);
      expect(fill).toHaveBeenCalledTimes(1);
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(false);
    } finally {
      h.editor.destroy();
    }
  });
  it('positions a diagnostic when the draft has no suggestions or function signature', () => {
    const h = createSheetEditorHarness();
    try {
      h.editor.commands.run(OpenCellEditorCommand, { row: 1, column: 1 });
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: '=1+*2' });
      h.view.render(h.core);
      const assist = h.editor.observations.getSnapshot(FormulaInputAssistObservation);
      expect(assist.suggestions).toEqual([]);
      expect(assist.signature).toBeNull();
      expect(assist.diagnostic?.kind).toBe('error');
      expect(assist.anchor).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    } finally {
      h.editor.destroy();
    }
  });
  it('has no scene until editing starts, then removes the overlay after cancellation', () => {
    const h = createSheetEditorHarness();
    try {
      expect(h.view.render(h.core)).toEqual([]);
      h.editor.commands.run(OpenCellEditorCommand, { row: 1, column: 1 });
      expect(h.view.render(h.core).some((node) => node.properties.isEdit)).toBe(true);
      h.editor.commands.run(CancelCellEditCommand, undefined);
      expect(h.view.render(h.core)).toEqual([]);
    } finally {
      h.editor.destroy();
    }
  });
  it('starts editing on the second mouse down when the retained target loses dblclick', () => {
    const h = createSheetEditorHarness();
    try {
      h.editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      expect(h.view.onMouseDown(h.core, { ...(click(1, 1) as object), clickCount: 2 } as never)).toBe(false);
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(true);
    } finally {
      h.editor.destroy();
    }
  });
  it('leaves missing targets and headers to the selection presentation', () => {
    const h = createSheetEditorHarness();
    try {
      expect(h.view.onDblClick(h.core, { target: null } as never)).toBe(true);
      expect(
        h.view.onDblClick(h.core, {
          target: { properties: { region: CellRegion.RowHeader, startRowIndex: 0 } },
        } as never),
      ).toBe(true);
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(false);
    } finally {
      h.editor.destroy();
    }
  });
  it('commits on an outside click together with the next cell selection', () => {
    const h = createSheetEditorHarness();
    try {
      h.editor.commands.run(OpenCellEditorCommand, { row: 1, column: 1 });
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'edited' });
      h.view.onMouseDown(h.core, click(5, 5, 550, 300));
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(false);
      expect(h.editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 1)?.value).toBe(
        'edited',
      );
    } finally {
      h.editor.destroy();
    }
  });
  it('BUG-070 grows a multiline editor upward when the next cell contains text', () => {
    const h = createSheetEditorHarness((state) => state.sheetData.addItem(4, 1, { type: 'string', value: 'occupied' }));
    try {
      h.editor.commands.run(ResizeSheetViewportCommand, { width: 600, height: 400 });
      h.editor.commands.run(OpenCellEditorCommand, { row: 3, column: 1 });
      const before = h.view.render(h.core).find((node) => node.properties.isEdit)!;
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'one\ntwo\nthree' });
      const after = h.view.render(h.core).find((node) => node.properties.isEdit)!;
      expect(after.height).toBeGreaterThan(before.height);
      expect(after.y).toBeLessThan(before.y);
    } finally {
      h.editor.destroy();
    }
  });
  it('keeps edit text synchronized with the same model across a viewport redraw', () => {
    const h = createSheetEditorHarness();
    try {
      h.editor.commands.run(OpenCellEditorCommand, { row: 1, column: 1 });
      h.editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      const model = h.owner.readEditModel();
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'shared draft' });
      h.editor.commands.run(RequestCellEditorRenderCommand, undefined);
      h.editor.commands.run(ResizeSheetViewportCommand, { width: 480, height: 320 });
      expect(h.owner.readEditModel()).toBe(model);
      expect(h.editor.observations.getSnapshot(SheetFormulaBarObservation).text).toBe('shared draft');
    } finally {
      h.editor.destroy();
    }
  });
  it('tears down an active view and its edit model exactly once', () => {
    const h = createSheetEditorHarness();
    h.editor.commands.run(OpenCellEditorCommand, { row: 1, column: 1 });
    const model = h.owner.readEditModel()!;
    expect(() => h.editor.destroy()).not.toThrow();
    expect(() => h.editor.destroy()).not.toThrow();
    expect(() => model.getDocument()).toThrow('disposed');
  });
});
