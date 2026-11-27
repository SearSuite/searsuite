import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import { DuplicateMatrix } from '../src/DuplicateMatrix';
import {
  createClearDuplicateHighlightOperations,
  createDeleteDuplicateRowsOperations,
  createHighlightDuplicateOperations,
  SheetDuplicateKeepMode,
  type SheetDuplicateCommandDataSource,
} from '../src/sheetPlugin/duplicate/SheetDuplicateCommands';
import { SheetDuplicatePlugin } from '../src/sheetPlugin/duplicate/SheetDuplicatePlugin';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { CellClipboardCodecRegistry, CellType } from '@searsuite/sear-domain-cell-types';
import { SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import { extractRichText } from '@searsuite/sear-domain-cell-types';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { HighlightDuplicateRowsCommand } from '../src';

function createDataSource(
  sheetData: SheetMatrix,
  duplicates = new DuplicateMatrix(void 0, sheetData.shape as [number, number]),
): SheetDuplicateCommandDataSource {
  const cellCodecs = new CellClipboardCodecRegistry();
  cellCodecs.register({
    cellType: CellType.RichText,
    encode: (cell) => cell.value,
    decode: (value) => ({ type: CellType.RichText, value }),
    toPlainText: (cell) => extractRichText(cell.value),
  });
  return {
    duplicateTarget: SheetDuplicatePlugin.pluginKey,
    sheetDataTarget: SheetDataPlugin.pluginKey,
    getRowCount: () => sheetData.shape[0],
    getColumnCount: () => sheetData.shape[1],
    readCell: (row, column) => sheetData.getItem(row, column),
    readCellText: (cell) => cellCodecs.toPlainText(cell),
    readDuplicateHighlight: (row, column) => duplicates.getItem(row, column),
  };
}

describe('SheetDuplicatePlugin commands', () => {
  it('BUG-082 groups projected spill cells with persisted values for highlighting', () => {
    const matrix = new SheetMatrix(void 0, [1, 2]);
    matrix.addItem(0, 0, { type: CellType.Number, value: 2 });
    const duplicates = new DuplicateMatrix(void 0, [1, 2]);
    const plugin = new SheetDuplicatePlugin(
      { duplicates },
      new SheetDataPlugin({ sheetData: matrix }),
      new CellClipboardCodecRegistry(),
      (_row, column, cell) => String(cell?.value ?? (column === 1 ? 2 : '')),
    );
    const commands = new SheetCommandBus();
    commands.bind({ executePipeline: () => {}, applyEffect: () => {} });
    plugin.registerCommands(commands);

    const result = commands.run(HighlightDuplicateRowsCommand, {
      anchor: [0, 0],
      focus: [0, 1],
      highlight: '#ffe8e6',
    });
    const step = result.pipeline.steps.find((item) => 'transaction' in item);
    expect(step && 'transaction' in step ? step.transaction.operations.map((operation) => operation.p) : []).toEqual([
      [0, 0],
      [0, 1],
    ]);

    duplicates.addItem(0, 0, '#ffe8e6');
    duplicates.addItem(0, 1, '#ffe8e6');
    const visuals = new SheetCellStyleRegistry();
    plugin.registerCellStyles(visuals);
    expect(visuals.read(0, 1)).toEqual({ fill: '#ffe8e6' });
  });

  it('overrides the visual fill without modifying the base fill and restores it when highlights clear', () => {
    const owner = new SheetDataPlugin({ sheetData: new SheetMatrix(void 0, [2, 2]) });
    const duplicates = new DuplicateMatrix(void 0, [2, 2]);
    duplicates.addItem(0, 0, '#ffe8e6');
    duplicates.addItem(1, 1, '#ffe8e6');
    owner.getState().sheetData.addItem(0, 0, { type: CellType.String, value: 'same' });
    owner.getState().sheetData.addItem(1, 1, { type: CellType.String, value: 'same' });
    const plugin = new SheetDuplicatePlugin({ duplicates }, owner, new CellClipboardCodecRegistry());
    const registry = new SheetCellStyleRegistry();
    plugin.registerCellStyles(registry);
    registry.register({ id: 'base-fill', properties: ['fill'], read: () => ({ fill: '#ffcc00' }) });
    expect(registry.read(0, 0)).toEqual({ fill: '#ffe8e6' });
    expect(registry.read(1, 0)).toEqual({ fill: '#ffcc00' });
    plugin.setState({ duplicates: new DuplicateMatrix(void 0, [2, 2]) });
    expect(registry.read(0, 0)).toEqual({ fill: '#ffcc00' });
  });

  it('hides stale duplicate fills after values diverge while keeping another duplicate group', () => {
    const sheetData = new SheetMatrix(void 0, [4, 1]);
    for (const [row, value] of ['same', 'same', 'other', 'other'].entries()) {
      sheetData.addItem(row, 0, { type: CellType.String, value });
    }
    const owner = new SheetDataPlugin({ sheetData });
    const duplicates = new DuplicateMatrix(void 0, [4, 1]);
    for (let row = 0; row < 4; row += 1) duplicates.addItem(row, 0, '#ffe8e6');
    const plugin = new SheetDuplicatePlugin({ duplicates }, owner, new CellClipboardCodecRegistry());
    const registry = new SheetCellStyleRegistry();
    plugin.registerCellStyles(registry);
    expect(registry.read(0, 0)).toEqual({ fill: '#ffe8e6' });
    const changed = sheetData.clone();
    changed.addItem(1, 0, { type: CellType.String, value: 'different' });
    owner.setState({ sheetData: changed });
    expect(registry.read(0, 0)).toEqual({});
    expect(registry.read(1, 0)).toEqual({});
    expect(registry.read(2, 0)).toEqual({ fill: '#ffe8e6' });
    const restored = changed.clone();
    restored.addItem(1, 0, { type: CellType.String, value: 'same' });
    owner.setState({ sheetData: restored });
    expect(registry.read(0, 0)).toEqual({ fill: '#ffe8e6' });
    expect(registry.read(1, 0)).toEqual({ fill: '#ffe8e6' });
  });

  it('reads the latest committed matrix after the sheet data owner replaces its state', () => {
    const initial = new SheetMatrix(void 0, [2, 1]);
    const owner = new SheetDataPlugin({ sheetData: initial });
    const plugin = new SheetDuplicatePlugin(
      { duplicates: new DuplicateMatrix(void 0, [2, 1]) },
      owner,
      new CellClipboardCodecRegistry(),
    );
    const commands = new SheetCommandBus();
    commands.bind({ executePipeline: () => {}, applyEffect: () => {} });
    plugin.registerCommands(commands);
    const committed = initial.clone();
    committed.addItem(0, 0, { type: CellType.String, value: 'aaa' });
    committed.addItem(1, 0, { type: CellType.String, value: 'aaa' });
    owner.setState({ sheetData: committed });
    const result = commands.run(HighlightDuplicateRowsCommand, {
      anchor: [0, 0],
      focus: [1, 0],
      highlight: '#ffe8e6',
    });
    const step = result.pipeline.steps.find((step) => 'transaction' in step);
    expect(step && 'transaction' in step ? step.transaction.operations : []).toHaveLength(2);
    expect(initial.getItem(0, 0)).toBeNull();
  });
  it('compares rich-text content independently of node IDs and styles and ignores empty text', () => {
    const sheetData = new SheetMatrix(void 0, [3, 2]);
    sheetData.addItem(0, 0, {
      type: CellType.RichText,
      value: [{ type: 'paragraph', id: 'first', content: [{ type: 'text', id: 'a', text: 'aaa' }] }],
    });
    sheetData.addItem(0, 1, {
      type: CellType.RichText,
      value: [{ type: 'paragraph', id: 'second', content: [{ type: 'text', id: 'b', text: 'aaa', bold: true }] }],
    });
    sheetData.addItem(1, 0, { type: CellType.String, value: 'aaa' });
    sheetData.addItem(1, 1, { type: CellType.String, value: '' });
    sheetData.addItem(2, 0, { type: CellType.RichText, value: [{ type: 'paragraph', content: [] }] });
    const dataSource = createDataSource(sheetData);
    expect(
      createHighlightDuplicateOperations({ anchor: [0, 0], focus: [2, 1], highlight: '#ffe8e6' }, dataSource).map(
        (operation) => operation.p,
      ),
    ).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(
      createDeleteDuplicateRowsOperations({ anchor: [0, 0], focus: [2, 1], columns: [0] }, dataSource).map(
        (operation) => operation.p,
      ),
    ).toEqual([[1]]);
  });
  it('creates highlight operations for duplicate cell values without touching unique cells', () => {
    const sheetData = new SheetMatrix(void 0, [4, 2]);
    sheetData.addItem(0, 0, { type: 'string', value: 'A' });
    sheetData.addItem(1, 0, { type: 'string', value: 'B' });
    sheetData.addItem(2, 0, { type: 'string', value: 'A' });
    sheetData.addItem(2, 1, { type: 'string', value: 'A' });
    sheetData.addItem(3, 0, { type: 'string', value: 'C' });

    const operations = createHighlightDuplicateOperations(
      { anchor: [0, 0], focus: [3, 1], highlight: '#ffe8e6' },
      createDataSource(sheetData),
    );

    expect(operations.map((operation) => operation.p)).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
    ]);
    expect(operations.every((operation) => operation.uc.value === '#ffe8e6')).toBe(true);
  });

  it('ignores empty cells when highlighting duplicate values', () => {
    const sheetData = new SheetMatrix(void 0, [4, 2]);
    sheetData.addItem(2, 1, { type: 'string', value: 'A' });
    sheetData.addItem(3, 1, { type: 'string', value: 'A' });

    const emptyOnlyOperations = createHighlightDuplicateOperations(
      { anchor: [0, 0], focus: [3, 0], highlight: '#ffe8e6' },
      createDataSource(sheetData),
    );
    const mixedOperations = createHighlightDuplicateOperations(
      { anchor: [0, 0], focus: [3, 1], highlight: '#ffe8e6' },
      createDataSource(sheetData),
    );

    expect(emptyOnlyOperations).toHaveLength(0);
    expect(mixedOperations.map((operation) => operation.p)).toEqual([
      [2, 1],
      [3, 1],
    ]);
  });

  it('groups duplicate text without regard to case for highlighting and deletion', () => {
    const sheetData = new SheetMatrix(void 0, [3, 1]);
    sheetData.addItem(0, 0, { type: CellType.String, value: 'foo' });
    sheetData.addItem(1, 0, { type: CellType.String, value: 'foo' });
    sheetData.addItem(2, 0, { type: CellType.String, value: 'Foo' });
    const dataSource = createDataSource(sheetData);
    expect(
      createHighlightDuplicateOperations(
        {
          anchor: [0, 0],
          focus: [2, 0],
          highlight: '#ffe8e6',
        },
        dataSource,
      ).map((operation) => operation.p),
    ).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(
      createDeleteDuplicateRowsOperations(
        {
          anchor: [0, 0],
          focus: [2, 0],
        },
        dataSource,
      ).map((operation) => operation.p),
    ).toEqual([[2], [1]]);
  });

  it('clears only existing duplicate highlights in the requested range', () => {
    const sheetData = new SheetMatrix(void 0, [2, 2]);
    const duplicates = new DuplicateMatrix(void 0, [2, 2]);
    duplicates.addItem(0, 0, '#ffe8e6');
    duplicates.addItem(1, 1, '#ffe8e6');

    const operations = createClearDuplicateHighlightOperations(
      { anchor: [0, 0], focus: [0, 1] },
      createDataSource(sheetData, duplicates),
    );

    expect(operations).toHaveLength(1);
    expect(operations[0].p).toEqual([0, 0]);
    expect(operations[0].uc.value).toBeNull();
    expect(operations[0].uc.prev).toBe('#ffe8e6');
  });

  it('creates row-delete operations for duplicate rows using the requested keep mode', () => {
    const sheetData = new SheetMatrix(void 0, [4, 2]);
    sheetData.addItem(0, 0, { type: 'string', value: 'name' });
    sheetData.addItem(1, 0, { type: 'string', value: 'A' });
    sheetData.addItem(1, 1, { type: 'number', value: 1 });
    sheetData.addItem(2, 0, { type: 'string', value: 'A' });
    sheetData.addItem(2, 1, { type: 'number', value: 2 });
    sheetData.addItem(3, 0, { type: 'string', value: 'A' });
    sheetData.addItem(3, 1, { type: 'number', value: 3 });

    const operations = createDeleteDuplicateRowsOperations(
      {
        anchor: [0, 0],
        focus: [3, 1],
        columns: [0],
        headerRow: true,
        keep: SheetDuplicateKeepMode.Last,
      },
      createDataSource(sheetData),
    );

    expect(operations.map((operation) => operation.p)).toEqual([[2], [1]]);
    expect(operations.map((operation) => operation.rd?.map((cell) => cell?.value))).toEqual([
      ['A', 2],
      ['A', 1],
    ]);
  });
});
