/** @jest-environment node */

import { createHeadlessEditor } from '../src';
import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import {
  createEmptySheetDocumentState,
  serializeSheetDocumentState,
  deserializeSheetDocumentState,
} from '@searsuite/sear-assembly-sheet-state';
import {
  InsertCheckboxesCommand,
  SetCheckboxesCommand,
  ToggleCheckboxesCommand,
  RemoveCheckboxesCommand,
  ReadCheckboxRangeQuery,
  CheckboxCellType,
  CheckboxRemovalMode,
  CheckboxError,
} from '@searsuite/sear-plugin-checkbox';
import { ReadSheetCellDataQuery } from '@searsuite/sear-domain-sheet';
import { UndoSheetCommand, RedoSheetCommand } from '@searsuite/sear-plugin-history';
import { GetFormulaCellStatusCommand, waitForFormulaIdle } from '@searsuite/sear-plugin-formula';
import {
  SetDataValidationRuleCommand,
  DataValidationKind,
  DataValidationInputPolicy,
} from '@searsuite/sear-plugin-data-validation';
const range = { anchor: [0, 0] as [number, number], focus: [1, 0] as [number, number] };
it('persists booleans through cell-owned OT, history and export while preserving unrelated data', async () => {
  const state = createEmptySheetDocumentState(20, 10);
  state.sheetData.addItem(0, 1, { type: 'formula', formula: '=COUNTIF(A1:A2,TRUE)' });
  state.sheetData.addItem(1, 1, { type: 'formula', formula: '=ISLOGICAL(A1)' });
  state.sheetData.addItem(0, 2, { type: 'string', value: 'preserved' });
  const editor = createHeadlessEditor({ sheetState: state });
  try {
    const cell = (r: number, c: number) => editor.queries.run(ReadSheetCellDataQuery, undefined).getItem(r, c);
    editor.commands.run(InsertCheckboxesCommand, range);
    expect(cell(0, 0)).toEqual({ type: CheckboxCellType, value: false });
    expect(editor.queries.run(ReadCheckboxRangeQuery, range)).toEqual({
      count: 2,
      checked: 0,
      unchecked: 2,
      mixed: false,
    });
    editor.commands.run(SetCheckboxesCommand, { anchor: [0, 0], focus: [0, 0], checked: true });
    await waitForFormulaIdle(editor.commands);
    expect(editor.commands.run(GetFormulaCellStatusCommand, { row: 0, col: 1 }).status.result).toBe(1);
    expect(editor.commands.run(GetFormulaCellStatusCommand, { row: 1, col: 1 }).status.result).toBe(true);
    expect(editor.queries.run(ReadCheckboxRangeQuery, range).mixed).toBe(true);
    editor.commands.run(ToggleCheckboxesCommand, range);
    expect(editor.queries.run(ReadCheckboxRangeQuery, range).checked).toBe(2);
    editor.commands.run(UndoSheetCommand, undefined);
    expect(editor.queries.run(ReadCheckboxRangeQuery, range).mixed).toBe(true);
    editor.commands.run(RedoSheetCommand, undefined);
    expect(editor.queries.run(ReadCheckboxRangeQuery, range).checked).toBe(2);
    expect(() => editor.commands.run(InsertCheckboxesCommand, { anchor: [0, 2], focus: [0, 3] })).toThrow(
      CheckboxError,
    );
    expect(cell(0, 3)).toBeNull();
    expect(cell(0, 2)?.value).toBe('preserved');
    const saved = deserializeSheetDocumentState(
        serializeSheetDocumentState(editor.commands.run(ExportSheetStateCommand, undefined).sheetState),
      ),
      second = createHeadlessEditor({ sheetState: saved });
    try {
      expect(second.queries.run(ReadCheckboxRangeQuery, range).checked).toBe(2);
    } finally {
      second.destroy();
    }
    editor.commands.run(RemoveCheckboxesCommand, { ...range, mode: CheckboxRemovalMode.Text });
    expect(cell(0, 0)).toEqual({ type: 'string', value: 'TRUE' });
    editor.commands.run(InsertCheckboxesCommand, range);
    editor.commands.run(RemoveCheckboxesCommand, { ...range, mode: CheckboxRemovalMode.Clear });
    expect(cell(0, 0)).toBeNull();
    expect(cell(0, 2)?.value).toBe('preserved');
  } finally {
    editor.destroy();
    editor.destroy();
  }
});
it('honors existing validation for direct checkbox writes without partial insertion', () => {
  const editor = createHeadlessEditor({ sheetState: createEmptySheetDocumentState(20, 10) });
  try {
    editor.commands.run(SetDataValidationRuleCommand, {
      anchor: [1, 0],
      focus: [1, 0],
      rule: { condition: { kind: DataValidationKind.Number }, inputPolicy: DataValidationInputPolicy.Reject },
    });
    expect(() => editor.commands.run(InsertCheckboxesCommand, range)).toThrow(CheckboxError);
    expect(editor.queries.run(ReadSheetCellDataQuery, undefined).getItem(0, 0)).toBeNull();
  } finally {
    editor.destroy();
  }
});
