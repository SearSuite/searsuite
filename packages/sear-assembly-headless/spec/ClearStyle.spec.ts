/** @jest-environment node */

import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { createHeadlessEditor } from '../src';
import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { SheetPlugin } from '@searsuite/sear-assembly-commands';

import { ClearRangeStylesCommand } from '@searsuite/sear-plugin-clear-style';
import { CellFormats } from '@searsuite/sear-domain-cell-types';
import { SheetHorizontalAlignment, SheetVerticalAlignment } from '@searsuite/sear-plugin-alignment';
import { CellBorderMatrix, SheetBorderLineStyle } from '@searsuite/sear-plugin-cell-border';
import { UndoSheetCommand, RedoSheetCommand, SheetHistoryStatusObservation } from '@searsuite/sear-plugin-history';
import { PluginKey, type SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

it('clears all contributed formats in one undo step and retains text, formulas, numeric types and unrelated state', () => {
  const state = createEmptySheetDocumentState(5, 5);
  const formula = { type: 'formula', formula: '=1+2', value: '=1+2' };
  const number = { type: 'number', value: 42 };
  state.sheetData.addItem(0, 0, {
    type: 'richtext',
    value: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Retained',
            attrs: {
              custom: 'keep',
              textStyle: {
                bold: true,
                italic: true,
                fontSize: 18,
                fontFamily: 'Georgia',
                color: '#ff0000',
                underline: true,
                strikethrough: true,
              },
            },
          },
        ],
      },
    ],
  });
  state.sheetData.addItem(1, 1, formula);
  state.sheetData.addItem(2, 2, number);
  state.cellFills.setItem(0, 0, '#ff0000');
  state.cellFills.setItem(4, 4, '#0000ff');
  state.cellAlignments.addItem(0, 0, SheetHorizontalAlignment.Center);
  state.cellVerticalAlignments.addItem(0, 0, SheetVerticalAlignment.Top);
  state.cellFormats.setItem(1, 1, CellFormats.percent);
  state.cellBorders = new CellBorderMatrix(undefined, [5, 5]);
  state.cellBorders.setItem(0, 0, { bottom: { color: '#ff0000', style: SheetBorderLineStyle.Thin } });
  const editor = createHeadlessEditor({ sheetState: state });
  const read = () => editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
  try {
    const before = read();
    editor.commands.run(ClearRangeStylesCommand, { anchor: [2, 2], focus: [0, 0] });
    const after = read();
    expect(after.cellFills.getItem(0, 0)).toBeNull();
    expect(after.cellFills.getItem(4, 4)).toBe('#0000ff');
    expect(after.cellAlignments.getItem(0, 0)).toBe(SheetHorizontalAlignment.Left);
    expect(after.cellVerticalAlignments.getItem(0, 0)).toBe(SheetVerticalAlignment.Center);
    expect(after.cellFormats.getItem(1, 1)).toBeNull();
    expect(after.cellBorders!.getItem(0, 0)).toBeNull();
    expect(after.sheetData.getItem(1, 1)).toEqual(formula);
    expect(after.sheetData.getItem(2, 2)).toEqual(number);
    expect(after.sheetData.getItem(0, 0)).toEqual({
      type: 'richtext',
      value: [{ type: 'paragraph', content: [{ type: 'text', text: 'Retained', attrs: { custom: 'keep' } }] }],
    });
    expect(after.rowSizes.getItem(0, 0)).toBe(before.rowSizes.getItem(0, 0));
    editor.commands.run(UndoSheetCommand, undefined);
    expect(read().cellFills.getItem(0, 0)).toBe('#ff0000');
    expect(read().cellFormats.getItem(1, 1)).toEqual(CellFormats.percent);
    expect(read().sheetData.getItem(0, 0)).toEqual(before.sheetData.getItem(0, 0));
    editor.commands.run(RedoSheetCommand, undefined);
    expect(read().cellFills.getItem(0, 0)).toBeNull();
    editor.commands.run(ClearRangeStylesCommand, { anchor: [0, 0], focus: [2, 2] });
    editor.commands.run(UndoSheetCommand, undefined);
    expect(read().cellFills.getItem(0, 0)).toBe('#ff0000');
  } finally {
    editor.destroy();
  }
});

@Injectable()
class RejectClearPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('RejectClearPlugin');
  public constructor() {
    super({ key: new PluginKey('RejectClearPlugin'), state: null });
  }
  public registerFormatTransfers(formats: SheetFormatTransferRegistry): void {
    formats.register({
      id: 'reject-clear',
      capture: () => ({ plan: () => [] }),
      clear: () => [{ target: this.key, operations: [createUpdateCellOTOperation([0, 0], 'reject', null)] }],
    });
  }
  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
  public apply(_state: null, transaction: Transaction): null {
    if (transaction.pluginKey === this.key) throw new SearError('clear rejected');
    return null;
  }
}

it('rolls back earlier owners when a later owner fails during transaction staging', () => {
  const state = createEmptySheetDocumentState(2, 2);
  state.cellFills.setItem(0, 0, '#ff0000');
  const editor = createHeadlessEditor({ sheetState: state, plugins: [RejectClearPlugin] });
  try {
    expect(() => editor.commands.run(ClearRangeStylesCommand, { anchor: [0, 0], focus: [0, 0] })).toThrow(
      'clear rejected',
    );
    expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.cellFills.getItem(0, 0)).toBe('#ff0000');
    expect(editor.observations.getSnapshot(SheetHistoryStatusObservation).canUndo).toBe(false);
  } finally {
    editor.destroy();
  }
});
