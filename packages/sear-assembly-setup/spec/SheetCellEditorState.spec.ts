import { SheetPlugin } from '@searsuite/sear-assembly-commands';
import { Injectable } from '@searsuite/sear-foundation-di';
import { createSheetEditorHarness } from './support/SheetEditorHarness';
import {
  OpenCellEditorCommand,
  HandleDocumentInputCommand,
  CommitCellEditCommand,
  CancelCellEditCommand,
  IsCellEditingQuery,
  SheetFormulaBarObservation,
  FormulaInputAssistObservation,
  UpdateCellEditorDocumentSelectionCommand,
  SheetCellEditorPlugin,
} from '@searsuite/sear-plugin-cell-editor';
import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { UndoSheetCommand, RedoSheetCommand } from '@searsuite/sear-plugin-history';
import { ToggleMergeCellsCommand } from '@searsuite/sear-plugin-cell-merge';
import { stringToRichDoc, paraText } from '@searsuite/sear-domain-doc';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateRectOTOperation, RectOTActionName } from '@searsuite/sear-domain-ot';

function readCell(h: ReturnType<typeof createSheetEditorHarness>, row = 1, column = 1) {
  return h.editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(row, column);
}
function open(h: ReturnType<typeof createSheetEditorHarness>, replaceContent = false) {
  h.editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
  h.editor.commands.run(OpenCellEditorCommand, { row: 1, column: 1, replaceContent });
}

describe('cell editing state and commands', () => {
  it.each([
    ['plain', 'hello'],
    ['number', 123],
    ['boolean', true],
  ] as const)('commits %s input through one undoable state publication', (_kind, value) => {
    const h = createSheetEditorHarness();
    try {
      open(h, true);
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: String(value) });
      h.editor.commands.run(CommitCellEditCommand, undefined);
      expect(readCell(h)?.value).toBe(value);
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(false);
      h.editor.commands.run(UndoSheetCommand, undefined);
      expect(readCell(h)).toBeNull();
      h.editor.commands.run(RedoSheetCommand, undefined);
      expect(readCell(h)?.value).toBe(value);
    } finally {
      h.editor.destroy();
    }
  });
  it('keeps a canceled draft out of persisted state and history', () => {
    const h = createSheetEditorHarness((state) => state.sheetData.addItem(1, 1, { type: 'string', value: 'original' }));
    try {
      open(h);
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'draft' });
      h.editor.commands.run(CancelCellEditCommand, undefined);
      expect(readCell(h)?.value).toBe('original');
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(false);
    } finally {
      h.editor.destroy();
    }
  });
  it('returns detached documents and selections from the owner', () => {
    const h = createSheetEditorHarness();
    try {
      open(h);
      const model = h.owner.readEditModel()!;
      const document = model.getDocument();
      const selection = h.owner.getDocumentSelection();
      selection.head.offset = 999;
      selection.anchor.path[0] = 6;
      (document[0]!.content[0] as { text: string }).text = 'forged';
      expect(h.owner.getDocumentSelection().head.offset).toBe(0);
      expect(model.getDocument().map(paraText).join('\n')).toBe('');
    } finally {
      h.editor.destroy();
    }
  });
  it('rejects model writes and owner cleanup outside a command', () => {
    const h = createSheetEditorHarness();
    try {
      open(h);
      expect(() => h.owner.readEditModel()!.handleInput({ type: 'insertText', text: 'forged' })).toThrow(
        'editor.commands.run',
      );
      expect(() => h.owner.readEditModel()!.dispose()).toThrow();
      expect(() => h.owner.setState(h.owner.getState())).toThrow();
      expect('core' in h.owner).toBe(false);
      expect('render' in h.owner).toBe(false);
    } finally {
      h.editor.destroy();
    }
  });
  it('keeps formula and reference internals inaccessible through forged properties', () => {
    const h = createSheetEditorHarness();
    try {
      open(h, true);
      Object.assign(h.owner, { formulaAnalysis: {}, formulaAutoClose: {}, isEditing: false });
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: '=1+2' });
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(true);
      expect(h.editor.observations.getSnapshot(SheetFormulaBarObservation).text).toBe('=1+2');
      expect(Reflect.get(h.owner, 'publishFormulaAssist')).toBeUndefined();
    } finally {
      h.editor.destroy();
    }
  });
  it.each([
    ['line breaks', 'x\n'.repeat(254)],
    ['cell text', 'x'.repeat(32768)],
  ])('rejects excessive %s and keeps its draft editable', (_label, text) => {
    const h = createSheetEditorHarness();
    try {
      open(h, true);
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text });
      expect(h.owner.readEditModel()!.getDocument().map(paraText).join('\n')).toBe('');
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(true);
      expect(readCell(h)).toBeNull();
    } finally {
      h.editor.destroy();
    }
  });
  it('does not lend write authority to formula observers or fail the owner when a listener throws', () => {
    const h = createSheetEditorHarness();
    let sawReadOnly = false;
    try {
      open(h, true);
      const stop = h.editor.observations.subscribe(FormulaInputAssistObservation, () => {
        sawReadOnly = !h.editor.commands.isExecuting();
        expect(() => h.owner.readEditModel()?.handleInput({ type: 'insertText', text: 'forged' })).toThrow();
        throw new Error('subscriber failed');
      });
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: '=SU' });
      expect(sawReadOnly).toBe(true);
      expect(h.editor.observations.getSnapshot(SheetFormulaBarObservation).text).toBe('=SU');
      stop();
    } finally {
      h.editor.destroy();
    }
  });
  it('BUG-959 commits multiline text and measured row growth as one undoable transaction group', () => {
    const h = createSheetEditorHarness();
    try {
      open(h, true);
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'one\ntwo\nthree' });
      const before = h.editor.commands.run(ExportSheetStateCommand, undefined).sheetState.rowSizes.getItem(0, 1);
      h.keyboard.handlers.onEnter?.(false, false);
      let state = h.editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.rowSizes.getItem(0, 1)).toBeGreaterThan(before!);
      expect(state.sheetData.getItem(1, 1)?.value).toBeDefined();
      h.editor.commands.run(UndoSheetCommand, undefined);
      state = h.editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(state.rowSizes.getItem(0, 1)).toBe(before);
      expect(state.sheetData.getItem(1, 1)).toBeNull();
    } finally {
      h.editor.destroy();
    }
  });
  it.each([NaN, Infinity, -1, 0])('rejects invalid measured height %s before changing state', (minimumRowHeight) => {
    const h = createSheetEditorHarness();
    try {
      open(h, true);
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'draft' });
      expect(() => h.editor.commands.run(CommitCellEditCommand, { minimumRowHeight })).toThrow('positive and finite');
      expect(readCell(h)).toBeNull();
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(true);
    } finally {
      h.editor.destroy();
    }
  });
  it('BUG-924 reads and edits a merged cell at its anchor', () => {
    const h = createSheetEditorHarness((state) => state.sheetData.addItem(1, 1, { type: 'string', value: 'merged' }));
    try {
      h.editor.commands.run(ToggleMergeCellsCommand, { anchor: [1, 1], focus: [2, 2] });
      h.editor.commands.run(SelectRangeCommand, { anchor: [2, 2], focus: [2, 2] });
      expect(h.editor.observations.getSnapshot(SheetFormulaBarObservation).text).toBe('merged');
      h.editor.commands.run(OpenCellEditorCommand, { row: 2, column: 2 });
      expect(h.owner.readEditModel()!.getDocument().map(paraText).join('\n')).toBe('merged');
    } finally {
      h.editor.destroy();
    }
  });
  it.each([
    { type: 'formula', formula: '=A1' },
    { type: 'string', value: stringToRichDoc('rich') },
  ])('opens canonical source content for $type', (cell) => {
    const h = createSheetEditorHarness((state) => state.sheetData.addItem(1, 1, cell));
    try {
      open(h);
      expect(h.owner.readEditModel()!.getDocument().map(paraText).join('\n')).toBe(
        cell.type === 'formula' ? '=A1' : 'rich',
      );
    } finally {
      h.editor.destroy();
    }
  });
  it('synchronizes document selection through its typed command', () => {
    const h = createSheetEditorHarness((state) => state.sheetData.addItem(1, 1, { type: 'string', value: 'abcd' }));
    try {
      open(h);
      h.editor.commands.run(UpdateCellEditorDocumentSelectionCommand, { anchor: [0, 1], head: [0, 3] });
      h.editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'X' });
      expect(h.owner.readEditModel()!.getDocument().map(paraText).join('\n')).toBe('aXd');
    } finally {
      h.editor.destroy();
    }
  });
  it('keeps unrelated and non-rectangle operations out of the editor reducer', () => {
    const h = createSheetEditorHarness();
    try {
      const state = h.owner.getState();
      expect(h.owner.apply(state, createTransaction(new PluginKey('other'), []))).toBe(state);
      const tx = createTransaction(SheetCellEditorPlugin.pluginKey, [createUpdateRectOTOperation([1], [2, 2], [3, 3])]);
      const detached = state.map((rect) => rect.clone()) as typeof state;
      h.owner.apply(detached, tx);
      expect(detached[1].getPoint(0)).toEqual([2, 2]);
      expect(state[1].getPoint(0)).not.toEqual([2, 2]);
    } finally {
      h.editor.destroy();
    }
  });
});

describe('cell editor atomic staging', () => {
  it.each(['open', 'cancel'])('preserves the active model when %s staging fails', (operation) => {
    let fail = false;
    @Injectable()
    class RejectEditProjection extends SheetPlugin<null> {
      public static readonly symbol = Symbol('RejectEditProjection');
      public override readonly interestedIn = [RectOTActionName.UpdateRect];
      public constructor() {
        super({ key: new PluginKey('reject.edit'), state: null });
      }
      public registerState() {
        return { key: this.key, state: null };
      }
      public apply(state: null, transaction: import('@searsuite/sear-domain-transaction').Transaction): null {
        if (fail && transaction.pluginKey === SheetCellEditorPlugin.pluginKey) throw new Error('edit staging rejected');
        return state;
      }
    }
    const h = createSheetEditorHarness(undefined, { plugins: [RejectEditProjection] });
    try {
      if (operation === 'cancel') open(h, true);
      const model = h.owner.readEditModel();
      fail = true;
      expect(() =>
        h.editor.commands.run(
          operation === 'open' ? OpenCellEditorCommand : CancelCellEditCommand,
          operation === 'open' ? { row: 1, column: 1 } : undefined,
        ),
      ).toThrow('edit staging rejected');
      expect(h.owner.readEditModel()).toBe(model);
      expect(h.editor.queries.run(IsCellEditingQuery, undefined)).toBe(operation === 'cancel');
      if (model) expect(() => model.getDocument()).not.toThrow();
    } finally {
      fail = false;
      h.editor.destroy();
    }
  });
});
