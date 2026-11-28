/** @jest-environment node */
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import {
  ConnectWorkbookCollaborationCommand,
  WorkbookCollaborationCapability,
} from '@searsuite/sear-assembly-workbook-kernel';
import { createWorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { ConnectSheetCollaborationCommand } from '@searsuite/sear-plugin-collab';
import { UndoSheetCommand } from '@searsuite/sear-plugin-history';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { createHeadlessEditor, createHeadlessWorkbookEditor } from '../src';

describe('optional Headless host capabilities', () => {
  it('creates a usable Sheet without registering a pretend collaboration connection', () => {
    const editor = createHeadlessEditor({ sheetState: createEmptySheetDocumentState(4, 4) });
    try {
      expect(editor.commands.has(ConnectSheetCollaborationCommand)).toBe(false);
      expect(editor.commands.has(UndoSheetCommand)).toBe(true);
      expect(() => editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [1, 1] })).not.toThrow();
      expect(() =>
        editor.commands.run(ConnectSheetCollaborationCommand, { url: 'unused', resourceId: 'sheet' }),
      ).toThrow();
    } finally {
      editor.destroy();
    }
  });

  it('creates a Workbook without collaboration channels when no transport is supplied', () => {
    const editor = createHeadlessWorkbookEditor({
      documentState: createWorkbookDocumentState({
        id: 'optional-host',
        sheets: [{ id: 'first', name: 'First' }],
        sheetStates: { first: createEmptySheetDocumentState(4, 4) },
      }),
    });
    try {
      expect(editor.commands.has(ConnectWorkbookCollaborationCommand)).toBe(false);
      expect(editor.services.get(WorkbookCollaborationCapability)).toBeUndefined();
      expect(editor.sheets.getActiveId()).toBe('first');
    } finally {
      editor.destroy();
    }
  });
});
