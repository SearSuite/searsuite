/** @jest-environment node */

import { createHeadlessEditor } from '../src';
import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import {
  ApplyFormatPainterCommand,
  FormatPainterMode,
  StartFormatPainterCommand,
  FormatPainterObservation,
} from '@searsuite/sear-plugin-format-painter';
import { SetRangeCellFillCommand } from '@searsuite/sear-plugin-cell-fill';
import { SetRangeAlignmentCommand, SheetHorizontalAlignment } from '@searsuite/sear-plugin-alignment';
import { UndoSheetCommand, RedoSheetCommand } from '@searsuite/sear-plugin-history';

const source = { start: [0, 0] as const, end: [0, 0] as const };
const destination = { start: [1, 1] as const, end: [1, 1] as const };

describe('Format painter in a real Sheet editor', () => {
  it('paints different owners atomically and records one undo step without changing target data', () => {
    const state = createEmptySheetDocumentState(4, 4);
    state.sheetData.addItem(1, 1, { type: 'formula', formula: '=1+2', value: '=1+2' });
    const editor = createHeadlessEditor({ sheetState: state });
    try {
      editor.commands.run(SetRangeCellFillCommand, { anchor: [0, 0], focus: [0, 0], fill: '#ff0000' });
      editor.commands.run(SetRangeAlignmentCommand, {
        anchor: [0, 0],
        focus: [0, 0],
        alignment: SheetHorizontalAlignment.Center,
      });
      editor.commands.run(StartFormatPainterCommand, { source });
      editor.commands.run(ApplyFormatPainterCommand, { destination });
      const read = () => editor.commands.run(ExportSheetStateCommand, void 0).sheetState;
      expect(read().cellFills.getItem(1, 1)).toBe('#ff0000');
      expect(read().cellAlignments.getItem(1, 1)).toBe(SheetHorizontalAlignment.Center);
      expect(read().sheetData.getItem(1, 1)).toEqual({ type: 'formula', formula: '=1+2', value: '=1+2' });
      editor.commands.run(UndoSheetCommand, void 0);
      expect(read().cellFills.getItem(1, 1)).toBeNull();
      expect(read().cellAlignments.getItem(1, 1)).toBe(SheetHorizontalAlignment.Left);
      editor.commands.run(RedoSheetCommand, void 0);
      expect(read().cellFills.getItem(1, 1)).toBe('#ff0000');
      expect(read().cellAlignments.getItem(1, 1)).toBe(SheetHorizontalAlignment.Center);
      expect(editor.observations.getSnapshot(FormatPainterObservation).mode).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it('clears target explicit formats from an unformatted source and retains a continuous brush', () => {
    const editor = createHeadlessEditor({ sheetState: createEmptySheetDocumentState(4, 4) });
    try {
      editor.commands.run(SetRangeCellFillCommand, { anchor: [1, 1], focus: [1, 1], fill: '#ff0000' });
      editor.commands.run(StartFormatPainterCommand, { source, mode: FormatPainterMode.Persistent });
      editor.commands.run(ApplyFormatPainterCommand, { destination });
      expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellFills.getItem(1, 1)).toBeNull();
      expect(editor.observations.getSnapshot(FormatPainterObservation).mode).toBe(FormatPainterMode.Persistent);
    } finally {
      editor.destroy();
      editor.destroy();
    }
  });
});

it('transfers registered inline styles without replacing target text or unrelated attributes', () => {
  const state = createEmptySheetDocumentState(4, 4);
  state.sheetData.addItem(0, 0, {
    type: 'richtext',
    value: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Source', attrs: { textStyle: { bold: true, fontSize: 18, color: '#ff0000' } } },
        ],
      },
    ],
  });
  state.sheetData.addItem(1, 1, {
    type: 'richtext',
    value: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Target', attrs: { custom: 'retained', textStyle: { italic: true } } }],
      },
    ],
  });
  state.sheetData.addItem(2, 2, { type: 'string', value: 'Plain target' });
  const editor = createHeadlessEditor({ sheetState: state });
  try {
    editor.commands.run(StartFormatPainterCommand, { source, mode: FormatPainterMode.Persistent });
    editor.commands.run(ApplyFormatPainterCommand, { destination });
    const read = () => editor.commands.run(ExportSheetStateCommand, void 0).sheetState;
    const target = read().sheetData.getItem(1, 1)!;
    expect(JSON.stringify(target.value)).toContain('Target');
    expect(JSON.stringify(target.value)).toContain('retained');
    expect(JSON.stringify(target.value)).toContain('"bold":true');
    expect(JSON.stringify(target.value)).not.toContain('"italic":true');
    editor.commands.run(ApplyFormatPainterCommand, { destination: { start: [2, 2], end: [2, 2] } });
    expect(read().sheetData.getItem(2, 2)!.type).toBe('richtext');
    expect(JSON.stringify(read().sheetData.getItem(2, 2)!.value)).toContain('Plain target');
    editor.commands.run(UndoSheetCommand, void 0);
    expect(read().sheetData.getItem(2, 2)).toEqual({ type: 'string', value: 'Plain target' });
  } finally {
    editor.destroy();
  }
});
