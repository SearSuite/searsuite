import { InsertDocTextCommand, UndoDocCommand } from '@searsuite/sear-assembly-doc';
import { ReadDocTextQuery, DocCommitObservation } from '@searsuite/sear-assembly-doc-kernel';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import {
  createHeadlessEditor,
  createHeadlessWorkbookEditor,
  createHeadlessDocEditor,
} from '@searsuite/sear-assembly-headless';
import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { SheetPlugin, ReadSheetCellStyleQuery } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';
import { createWorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { SetRangeCellFillCommand } from '@searsuite/sear-plugin-cell-fill';
import { UndoSheetCommand } from '@searsuite/sear-plugin-history';
import { SheetCommitObservation, ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import { GetFormulaCellStatusCommand, waitForFormulaIdle } from '@searsuite/sear-plugin-formula';

class ExternalStylePlugin extends SheetPlugin {
  static symbol = Symbol('ExternalStylePlugin');
  constructor() {
    super({ key: new PluginKey('external.style'), state: null });
  }
  apply() {
    return null;
  }
  registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
  registerCellStyles(registry) {
    registry.register({ id: 'external.style', properties: ['stroke'], read: () => ({ stroke: '#336699' }) });
  }
}
Injectable()(ExternalStylePlugin);

(async () => {
  const state = createEmptySheetDocumentState(4, 4);
  state.sheetData.addItem(0, 0, { type: 'number', value: 21 });
  state.sheetData.addItem(1, 0, { type: 'formula', formula: '=A1*2' });
  const editor = createHeadlessEditor({ sheetState: state, plugins: [ExternalStylePlugin] });
  try {
    assert.equal(editor.queries.run(ReadSheetCellStyleQuery, [0, 0]).stroke, '#336699');
    await waitForFormulaIdle(editor.commands);
    assert.equal(editor.commands.run(GetFormulaCellStatusCommand, { row: 1, col: 0 }).status.result, 42);
    const revisions = [];
    const dispose = editor.observations.subscribe(SheetCommitObservation, (snapshot) =>
      revisions.push(snapshot.revision),
    );
    editor.commands.run(SetRangeCellFillCommand, { anchor: [0, 0], focus: [0, 0], fill: '#112233' });
    assert.equal(editor.commands.run(ExportSheetStateCommand).sheetState.cellFills.getItem(0, 0), '#112233');
    editor.commands.run(UndoSheetCommand);
    assert.equal(editor.commands.run(ExportSheetStateCommand).sheetState.cellFills.getItem(0, 0), null);
    assert.ok(revisions.length >= 3);
    dispose();
  } finally {
    editor.destroy();
  }
  const workbook = createHeadlessWorkbookEditor({
    documentState: createWorkbookDocumentState({
      id: 'external',
      sheets: [{ id: 's1', name: 'Sheet 1' }],
      sheetStates: { s1: createEmptySheetDocumentState(2, 2) },
    }),
  });
  try {
    assert.ok(workbook.sheets.getActiveEditor().commands);
  } finally {
    workbook.destroy();
  }
  const doc = createHeadlessDocEditor({ documentState: { document: [] } });
  try {
    const revisions = [];
    const unsubscribe = doc.observations.subscribe(DocCommitObservation, (snapshot) =>
      revisions.push(snapshot.revision),
    );
    doc.commands.run(InsertDocTextCommand, { text: 'Independent document' });
    assert.equal(doc.queries.run(ReadDocTextQuery, undefined), 'Independent document');
    doc.commands.run(UndoDocCommand, undefined);
    assert.equal(doc.getText(), '');
    assert.deepEqual(revisions, [0, 1, 2]);
    unsubscribe();
  } finally {
    doc.destroy();
  }
  const presentation = Object.keys(require.cache).filter((path) =>
    /[\\/]sear-(?:render(?:-|[\\/])|assembly-(?:core|setup|sheet-doc|workbook)[\\/]|sheet-editor-contract[\\/])/.test(
      path,
    ),
  );
  assert.deepEqual(presentation, [], 'Headless must not load presentation packages');
  console.log(
    'Packed Headless runtime passed: plugin styles, formulas, commits, undo, Workbook and Doc; no presentation loaded.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
