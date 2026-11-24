const { createHeadlessEditor } = require('@searsuite/sear-assembly-headless');
const { createEmptySheetDocumentState, ExportSheetStateCommand } = require('@searsuite/sear-assembly-setup');
const { SetRangeCellFillCommand } = require('@searsuite/sear-plugin-cell-fill');

const state = createEmptySheetDocumentState(4, 4);
state.sheetData.addItem(0, 0, { type: 'string', value: 'Hello, SearSuite' });

const editor = createHeadlessEditor({ sheetState: state });
try {
  editor.commands.run(SetRangeCellFillCommand, {
    anchor: [0, 0],
    focus: [0, 0],
    fill: '#dcefe2',
  });

  const snapshot = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
  console.log(snapshot.sheetData.getItem(0, 0).value);
  console.log(snapshot.cellFills.getItem(0, 0));
} finally {
  editor.destroy();
}
