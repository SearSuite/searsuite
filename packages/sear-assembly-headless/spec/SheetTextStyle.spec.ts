/** @jest-environment node */

import { createHeadlessEditor } from '../src';
import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-sheet-state';

import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { SetRangeCellTextStyleCommand } from '@searsuite/sear-plugin-cell-editor';
import { UndoSheetCommand } from '@searsuite/sear-plugin-history';

it('BUG-583 styles complete text cells from a grid selection and undoes in one step', () => {
  const state = createEmptySheetDocumentState(3, 3);
  state.sheetData.addItem(0, 0, { type: 'string', value: 'apple' });
  state.sheetData.addItem(1, 1, { type: 'string', value: 'pear' });
  const editor = createHeadlessEditor({ sheetState: state });
  const read = () => editor.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData;
  try {
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [1, 1] });
    editor.commands.run(SetRangeCellTextStyleCommand, {
      attrs: { bold: true, italic: true, underline: true, strikethrough: true, fontFamily: 'Georgia', fontSize: 16 },
    });
    for (const [row, col, text] of [
      [0, 0, 'apple'],
      [1, 1, 'pear'],
    ] as const) {
      const cell = read().getItem(row, col);
      expect(cell?.type).toBe('richtext');
      expect(cell?.value).toEqual([
        expect.objectContaining({
          type: 'paragraph',
          content: [
            expect.objectContaining({
              text,
              attrs: {
                textStyle: expect.objectContaining({
                  bold: true,
                  italic: true,
                  underline: true,
                  strikethrough: true,
                  fontFamily: 'Georgia',
                  fontSize: 16,
                }),
              },
            }),
          ],
        }),
      ]);
    }
    editor.commands.run(UndoSheetCommand, void 0);
    expect(read().getItem(0, 0)).toEqual({ type: 'string', value: 'apple' });
    expect(read().getItem(1, 1)).toEqual({ type: 'string', value: 'pear' });
  } finally {
    editor.destroy();
  }
});
