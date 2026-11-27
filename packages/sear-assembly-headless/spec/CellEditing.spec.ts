/** @jest-environment node */

import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import {
  OpenCellEditorCommand,
  HandleDocumentInputCommand,
  CommitCellEditCommand,
  CancelCellEditCommand,
  IsCellEditingQuery,
} from '@searsuite/sear-plugin-cell-editor';
import { UndoSheetCommand, RedoSheetCommand } from '@searsuite/sear-plugin-history';
import { TextInputKind } from '@searsuite/sear-domain-commands';
import { createHeadlessEditor } from '../src';

describe('headless cell editing', () => {
  it('edits, commits and replays a cell using the same business commands as a view', () => {
    const editor = createHeadlessEditor({ sheetState: createEmptySheetDocumentState(4, 4) });
    editor.commands.run(OpenCellEditorCommand, { row: 1, column: 2 });
    expect(editor.queries.run(IsCellEditingQuery, undefined)).toBe(true);
    editor.commands.run(HandleDocumentInputCommand, { kind: TextInputKind.Text, text: '123' });
    editor.commands.run(CommitCellEditCommand, undefined);
    expect(editor.queries.run(IsCellEditingQuery, undefined)).toBe(false);
    const read = () => editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 2);
    expect(read()?.value).toBe(123);
    editor.commands.run(UndoSheetCommand, undefined);
    expect(read()).toBeNull();
    editor.commands.run(RedoSheetCommand, undefined);
    expect(read()?.value).toBe(123);
    editor.commands.run(OpenCellEditorCommand, { row: 1, column: 2, replaceContent: true });
    editor.commands.run(HandleDocumentInputCommand, { kind: TextInputKind.Text, text: 'discard' });
    editor.commands.run(CancelCellEditCommand, undefined);
    expect(read()?.value).toBe(123);
    editor.destroy();
  });
});
