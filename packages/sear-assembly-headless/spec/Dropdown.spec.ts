/** @jest-environment node */

import { createHeadlessEditor } from '../src';
import {
  createEmptySheetDocumentState,
  ExportSheetStateCommand,
  serializeSheetDocumentState,
  deserializeSheetDocumentState,
} from '@searsuite/sear-assembly-setup';
import {
  SetDataValidationRuleCommand,
  RemoveDataValidationRuleCommand,
  DataValidationKind,
  DataValidationDropdownMode,
  DataValidationInputPolicy,
} from '@searsuite/sear-plugin-data-validation';
import {
  ReadDropdownCellQuery,
  PickDropdownOptionCommand,
  ClearDropdownValueCommand,
  OpenDropdownPickerCommand,
  DropdownPickerRequest,
  DropdownError,
  DropdownMode,
} from '@searsuite/sear-plugin-dropdown';
import { ReadSheetCellDataQuery } from '@searsuite/sear-render-engine';
import { UndoSheetCommand, RedoSheetCommand } from '@searsuite/sear-plugin-history';
import { GetFormulaCellStatusCommand, waitForFormulaIdle } from '@searsuite/sear-plugin-formula';
const cell = { row: 0, column: 0 },
  range = { anchor: [0, 0] as [number, number], focus: [1, 0] as [number, number] };
it('shares validation-owned rules with atomic cell history, CSV values, formulas and export', async () => {
  const state = createEmptySheetDocumentState(20, 10);
  state.sheetData.addItem(0, 1, { type: 'formula', formula: '=A1="Pending"' });
  const editor = createHeadlessEditor({ sheetState: state });
  try {
    editor.commands.run(SetDataValidationRuleCommand, {
      ...range,
      rule: {
        condition: {
          kind: DataValidationKind.Dropdown,
          options: [{ label: 'Pending', color: '#ffeecc' }, { label: 'Done' }, { label: 'A,B' }, { label: ' say "yes" ' }],
          dropdownMode: DataValidationDropdownMode.Single,
        },
        inputPolicy: DataValidationInputPolicy.Reject,
      },
    });
    const initial = editor.queries.run(ReadDropdownCellQuery, cell)!;
    expect(initial.options).toHaveLength(4);
    expect(initial.multiple).toBe(false);
    const requests: unknown[] = [];
    const dispose = editor.observations.subscribe(DropdownPickerRequest, (input) => requests.push(input));
    editor.commands.run(OpenDropdownPickerCommand, cell);
    expect(requests).toEqual([cell]);
    dispose();
    editor.commands.run(PickDropdownOptionCommand, { ...cell, label: 'Pending', ruleId: initial.ruleId });
    await waitForFormulaIdle(editor.commands);
    expect(editor.commands.run(GetFormulaCellStatusCommand, { row: 0, col: 1 }).status.result).toBe(true);
    editor.commands.run(UndoSheetCommand, undefined);
    expect(editor.queries.run(ReadDropdownCellQuery, cell)!.selected).toEqual([]);
    editor.commands.run(RedoSheetCommand, undefined);
    expect(editor.queries.run(ReadDropdownCellQuery, cell)!.selected).toEqual(['Pending']);
    expect(() => editor.commands.run(PickDropdownOptionCommand, { ...cell, label: 'invalid' })).toThrow(DropdownError);
    expect(() => editor.commands.run(PickDropdownOptionCommand, { ...cell, label: 'Done', ruleId: 'stale' })).toThrow(
      DropdownError,
    );
    editor.commands.run(SetDataValidationRuleCommand, {
      ...range,
      id: initial.ruleId,
      rule: {
        condition: { kind: DataValidationKind.Dropdown, dropdownMode: DropdownMode.Multiple, options: initial.options },
        inputPolicy: DataValidationInputPolicy.Reject,
      },
    });
    editor.commands.run(PickDropdownOptionCommand, { ...cell, label: 'A,B' });
    editor.commands.run(PickDropdownOptionCommand, { ...cell, label: ' say "yes" ' });
    expect(editor.queries.run(ReadDropdownCellQuery, cell)!.selected).toEqual(['Pending', 'A,B', ' say "yes" ']);
    editor.commands.run(PickDropdownOptionCommand, { ...cell, label: 'Pending' });
    expect(editor.queries.run(ReadDropdownCellQuery, cell)!.selected).toEqual(['A,B', ' say "yes" ']);
    const exported = editor.commands.run(ExportSheetStateCommand, undefined);
    const restored = createHeadlessEditor({
      sheetState: deserializeSheetDocumentState(serializeSheetDocumentState(exported.sheetState)),
    });
    try {
      expect(restored.queries.run(ReadDropdownCellQuery, cell)!.selected).toEqual(['A,B', ' say "yes" ']);
    } finally {
      restored.destroy();
    }
    editor.commands.run(ClearDropdownValueCommand, cell);
    expect(editor.queries.run(ReadSheetCellDataQuery, undefined).getItem(0, 0)).toBeNull();
    expect(editor.queries.run(ReadDropdownCellQuery, cell)).not.toBeNull();
    editor.commands.run(RemoveDataValidationRuleCommand, { id: initial.ruleId });
    expect(editor.queries.run(ReadDropdownCellQuery, cell)).toBeNull();
    expect(() => editor.commands.run(ClearDropdownValueCommand, cell)).toThrow(DropdownError);
  } finally {
    editor.destroy();
  }
});
it('reads live distinct source values and rejects incompatible overlapping validation atomically', () => {
  const state = createEmptySheetDocumentState(1000000, 10);
  state.sheetData.addItem(0, 2, { type: 'string', value: 'Alpha' });
  state.sheetData.addItem(999999, 2, { type: 'string', value: 'Beta' });
  const editor = createHeadlessEditor({ sheetState: state });
  try {
    editor.commands.run(SetDataValidationRuleCommand, {
      ...range,
      rule: {
        condition: { kind: DataValidationKind.Dropdown, sourceRange: { start: [0, 2], end: [999999, 2] } },
        inputPolicy: DataValidationInputPolicy.Reject,
      },
    });
    expect(editor.queries.run(ReadDropdownCellQuery, cell)!.options.map((option) => option.label)).toEqual([
      'Alpha',
      'Beta',
    ]);
    editor.commands.run(SetDataValidationRuleCommand, {
      ...range,
      rule: { condition: { kind: DataValidationKind.Number }, inputPolicy: DataValidationInputPolicy.Reject },
    });
    expect(() => editor.commands.run(PickDropdownOptionCommand, { ...cell, label: 'Alpha' })).toThrow(DropdownError);
    expect(editor.queries.run(ReadSheetCellDataQuery, undefined).getItem(0, 0)).toBeNull();
  } finally {
    editor.destroy();
  }
});
