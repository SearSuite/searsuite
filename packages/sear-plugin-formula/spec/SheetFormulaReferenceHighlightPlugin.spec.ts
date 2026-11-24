import { CellType } from '@searsuite/sear-domain-cell-types';
import { FormulaNodeKind } from '@searsuite/sear-domain-formula-engine';
import { cellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-render-engine';
import { SheetColumnSizesFieldKey, SheetRowSizesFieldKey } from '@searsuite/sear-plugin-resize';
import { SheetFormulaReferenceHighlightPlugin } from '../src/formulaReferenceHighlight/SheetFormulaReferenceHighlightPlugin';

function createCore(cell: unknown, rowCount = 5, colCount = 6) {
  const fields = {
    sheetData: { getItem: () => cell },
    rowSizes: { shape: [1, rowCount] },
    columnSizes: { shape: [1, colCount] },
  };
  return {
    getDataEngine: () => ({
      getDataType: () => void 0,
      readDataViewField: (_viewKey: string, fieldKey: string) => {
        if (_viewKey !== SheetDataFieldNamespace) return void 0;
        if (fieldKey === SheetDataMatrixFieldKey) return fields.sheetData;
        if (fieldKey === SheetRowSizesFieldKey) return fields.rowSizes;
        if (fieldKey === SheetColumnSizesFieldKey) return fields.columnSizes;
        return void 0;
      },
    }),
  };
}

describe('SheetFormulaReferenceHighlightPlugin', () => {
  it('registers highlight provider and returns no highlights when interaction state suppresses selection', () => {
    const statusProvider = { getFormulaCellStatus: jest.fn(() => ({ dependencies: [], dependents: [] })) };
    const configEngine = { getPluginConfig: jest.fn(() => void 0) };
    const register = jest.fn();
    const interactionStore = {
      getState: jest
        .fn()
        .mockReturnValueOnce({ editSession: { kind: 'cell' } })
        .mockReturnValueOnce({ editSession: null, suppressedSelectionRevision: 2, selectionRevision: 1 })
        .mockReturnValueOnce({ editSession: null, suppressedSelectionRevision: null, selectionRevision: 3 }),
    };
    const plugin = new SheetFormulaReferenceHighlightPlugin(
      statusProvider as never,
      configEngine as never,
      { register } as never,
      interactionStore as never,
    );

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ key: SheetFormulaReferenceHighlightPlugin.highlightProviderKey }),
    );
    expect(plugin.getHighlights({ searCore: createCore(null) } as never)).toEqual([]);
    expect(plugin.getHighlights({ searCore: createCore(null) } as never)).toEqual([]);
    expect(plugin.getHighlights({ searCore: { getDataEngine: () => ({ getDataType: () => null }) } } as never)).toEqual(
      [],
    );
    expect(plugin.registerState().key).toBe(plugin.key);
    expect(plugin.getPluginConfig()).toEqual({});
    expect(plugin.apply({} as never, {} as never)).toBeNull();
    expect(plugin.render({} as never)).toEqual([]);
  });

  it('resolves dependencies and dependents into range highlights', () => {
    const statusProvider = {
      getFormulaCellStatus: jest.fn(() => ({
        dependencies: [
          { kind: FormulaNodeKind.Cell, row: 2, col: 3 },
          { kind: FormulaNodeKind.Range, start: [1, 1], end: [2, 2] },
          { kind: FormulaNodeKind.ColumnRange, startCol: 1, endCol: 2 },
          { kind: FormulaNodeKind.RowRange, startRow: 2, endRow: 3 },
        ],
        dependents: [cellKey(5, 4)],
      })),
    };
    const configEngine = {
      getPluginConfig: jest.fn(() => ({
        referenceColors: ['#ff0000', '#00ff00', '#0000ff', '#112233'],
        referenceFillOpacity: 0.2,
      })),
    };
    const interactionStore = {
      getState: jest.fn(() => ({
        editSession: null,
        suppressedSelectionRevision: null,
        selectionRevision: 1,
        selection: { focus: [4, 2] },
      })),
    };
    const plugin = new SheetFormulaReferenceHighlightPlugin(
      statusProvider as never,
      configEngine as never,
      { register: jest.fn() } as never,
      interactionStore as never,
    );

    const highlights = plugin.getHighlights({
      searCore: createCore({ type: CellType.Formula, formula: '=A1' }, 10, 8),
    } as never);

    expect(highlights).toHaveLength(5);
    expect(highlights[0]).toEqual(
      expect.objectContaining({ start: [2, 3], end: [2, 3], type: 'formula-reference-highlight' }),
    );
    expect(highlights[1]).toEqual(expect.objectContaining({ start: [1, 1], end: [2, 2] }));
    expect(highlights[2]).toEqual(expect.objectContaining({ start: [0, 1], end: [9, 2] }));
    expect(highlights[3]).toEqual(expect.objectContaining({ start: [2, 0], end: [3, 7] }));
    expect(highlights[4]).toEqual(
      expect.objectContaining({ start: [5, 4], end: [5, 4], type: 'formula-dependent-highlight' }),
    );
    expect(highlights[0].fill).toBe('rgba(255, 0, 0, 0.2)');
  });

  it('returns empty highlights for negative focus, cells without dependencies, or empty shapes', () => {
    const statusProvider = {
      getFormulaCellStatus: jest.fn(() => ({ dependencies: [], dependents: [] })),
    };
    const interactionStore = {
      getState: jest
        .fn()
        .mockReturnValueOnce({
          editSession: null,
          suppressedSelectionRevision: null,
          selectionRevision: 1,
          selection: { focus: [-1, 0] },
        })
        .mockReturnValueOnce({
          editSession: null,
          suppressedSelectionRevision: null,
          selectionRevision: 1,
          selection: { focus: [0, 0] },
        })
        .mockReturnValueOnce({
          editSession: null,
          suppressedSelectionRevision: null,
          selectionRevision: 1,
          selection: { focus: [0, 0] },
        }),
    };
    const plugin = new SheetFormulaReferenceHighlightPlugin(
      statusProvider as never,
      { getPluginConfig: jest.fn(() => void 0) } as never,
      { register: jest.fn() } as never,
      interactionStore as never,
    );

    expect(plugin.getHighlights({ searCore: createCore({ type: CellType.Formula, formula: '=A1' }) } as never)).toEqual(
      [],
    );
    expect(plugin.getHighlights({ searCore: createCore({ type: CellType.Number, value: 1 }) } as never)).toEqual([]);
    expect(plugin.getHighlights({ searCore: createCore({ type: CellType.Formula, formula: '=A1' }) } as never)).toEqual(
      [],
    );


  });

  it.each([
    { dependency: { kind: FormulaNodeKind.RowRange, startRow: 0, endRow: 1 }, rows: 3, columns: 0 },
    { dependency: { kind: FormulaNodeKind.ColumnRange, startCol: 1, endCol: 2 }, rows: 0, columns: 3 },
  ])('returns no highlight for unresolved bounds in a $rows × $columns sheet', ({ dependency, rows, columns }) => {
    const statusProvider = {
      getFormulaCellStatus: jest.fn(() => ({
        dependencies: [dependency],
        dependents: [],
      })),
    };
    const interactionStore = {
      getState: jest.fn(() => ({
        editSession: null,
        suppressedSelectionRevision: null,
        selectionRevision: 1,
        selection: { focus: [0, 0] },
      })),
    };
    const plugin = new SheetFormulaReferenceHighlightPlugin(
      statusProvider as never,
      { getPluginConfig: jest.fn(() => void 0) } as never,
      { register: jest.fn() } as never,
      interactionStore as never,
    );

    const highlights = plugin.getHighlights({
      searCore: createCore({ type: CellType.Formula, formula: '=1' }, rows, columns),
    } as never);

    expect(highlights).toEqual([]);
  });

  it('renders qualified references supplied by the workbook on the active sheet', () => {
    const plugin = new SheetFormulaReferenceHighlightPlugin(
      { getFormulaCellStatus: () => ({ dependencies: [], dependents: [] }) } as never,
      { getPluginConfig: () => void 0 } as never,
      { register: jest.fn() } as never,
      {
        getState: () => ({
          editSession: null,
          suppressedSelectionRevision: null,
          selectionRevision: 4,
          selection: { focus: [0, 0] },
        }),
      } as never,
    );
    plugin.bindCrossSheetSource({
      getReferences: (revision: number) => (revision === 4 ? [{ start: [1, 2], end: [3, 4], index: 2 }] : []),
    } as never);
    expect(plugin.getHighlights({ searCore: createCore(null) } as never)).toEqual([
      expect.objectContaining({ start: [1, 2], end: [3, 4], type: 'formula-reference-highlight' }),
    ]);
    plugin.enforceStateWriteBoundary({});
    expect(() => plugin.bindCrossSheetSource({ getReferences: () => [] } as never)).toThrow(
      'cannot change after editor assembly',
    );
    (plugin as unknown as { crossSheetSource: unknown }).crossSheetSource = { getReferences: () => [] };
    expect(plugin.getHighlights({ searCore: createCore(null) } as never)).toEqual([
      expect.objectContaining({ start: [1, 2], end: [3, 4], type: 'formula-reference-highlight' }),
    ]);
  });

  it('keeps in-bounds workbook references visible before the target sheet has a selection', () => {
    const plugin = new SheetFormulaReferenceHighlightPlugin(
      { getFormulaCellStatus: jest.fn() } as never,
      { getPluginConfig: () => void 0 } as never,
      { register: jest.fn() } as never,
      {
        getState: () => ({
          editSession: null,
          suppressedSelectionRevision: null,
          selectionRevision: 0,
          selection: null,
        }),
      } as never,
    );
    plugin.bindCrossSheetSource({
      getReferences: () => [
        { start: [1, 1], end: [1, 1], index: 0 },
        { start: [9, 9], end: [9, 9], index: 1 },
      ],
    } as never);
    expect(plugin.getHighlights({ searCore: createCore(null, 5, 6) } as never)).toEqual([
      expect.objectContaining({ start: [1, 1], end: [1, 1] }),
    ]);
  });
});
