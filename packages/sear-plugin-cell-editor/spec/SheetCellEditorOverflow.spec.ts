import { Container } from '@searsuite/sear-foundation-di';
import { SheetHorizontalAlignment } from '@searsuite/sear-plugin-alignment';
import { TextShaper } from '@searsuite/sear-render-metrics';
import { DocNodeRegistry, stringToRichDoc } from '@searsuite/sear-domain-doc';
import { computeCellEditorOverflowLeftX } from '../src/computeCellEditorOverflowLeftX';

let container: Container;

interface EditorInternals {
  computeOverflowLeftX(
    core: { configEngine: { getDefaultConfig(): { defaultCellAlign?: SheetHorizontalAlignment } } },
    state: {
      cellAlignments?: { getItem(row: number, col: number): SheetHorizontalAlignment | undefined };
      sheetData: { getItem(row: number, col: number): { value?: unknown } | undefined };
    },
    anchor: [number, number],
    cellLeftX: number,
    baseWidth: number,
    cellPadding: number,
  ): number;
}

function createEditor(): EditorInternals {
  let textShaper: TextShaper | undefined;
  try { textShaper = container.resolve<TextShaper>(TextShaper.symbol); } catch { /* Optional measurement. */ }
  return {
    computeOverflowLeftX: (core, state, anchor, cellLeftX, baseWidth, cellPadding) =>
      computeCellEditorOverflowLeftX(
        core.configEngine.getDefaultConfig(), state, textShaper, anchor, cellLeftX, baseWidth, cellPadding,
      ),
  };
}

describe('SheetCellEditorPlugin overflow bounds', () => {
  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    container.reset();
  });

  it('keeps left-aligned, empty, and unsupported values within the cell boundary', () => {
    const editor = createEditor();
    const core = { configEngine: { getDefaultConfig: () => ({ defaultCellAlign: SheetHorizontalAlignment.Left }) } };

    expect(
      editor.computeOverflowLeftX(core, { sheetData: { getItem: () => ({ value: 'wide text' }) } }, [0, 0], 50, 20, 2),
    ).toBe(50);
    expect(
      editor.computeOverflowLeftX(core, { sheetData: { getItem: () => ({ value: '' }) } }, [0, 0], 50, 20, 2),
    ).toBe(50);
    expect(
      editor.computeOverflowLeftX(
        core,
        { sheetData: { getItem: () => ({ value: { unsupported: true } }) } },
        [0, 0],
        50,
        20,
        2,
      ),
    ).toBe(50);
  });

  it('returns the leftward overflow extent for centered and right-aligned text', () => {
    container.registerInstance(TextShaper.symbol, { shape: () => ({ width: 40 }) } as never);
    const editor = createEditor();
    const core = { configEngine: { getDefaultConfig: () => ({ defaultCellAlign: SheetHorizontalAlignment.Center }) } };
    const state = {
      cellAlignments: { getItem: (_row: number, col: number) => (col === 1 ? SheetHorizontalAlignment.Right : void 0) },
      sheetData: { getItem: () => ({ value: 'overflow' }) },
    };

    expect(editor.computeOverflowLeftX(core, state, [0, 0], 100, 20, 2)).toBe(90);
    expect(editor.computeOverflowLeftX(core, state, [0, 1], 100, 20, 2)).toBe(78);
  });

  it('converts rich-doc arrays and numeric values before measuring overflow', () => {
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    container.registerInstance(TextShaper.symbol, { shape: () => ({ width: 30 }) } as never);
    const editor = createEditor();
    const core = { configEngine: { getDefaultConfig: () => ({ defaultCellAlign: SheetHorizontalAlignment.Right }) } };

    const richDocState = {
      sheetData: {
        getItem: () => ({ value: stringToRichDoc('hello') }),
      },
    };
    const numberState = {
      sheetData: { getItem: () => ({ value: 12345 }) },
    };

    expect(editor.computeOverflowLeftX(core, richDocState as never, [0, 0], 100, 20, 2)).toBe(88);
    expect(editor.computeOverflowLeftX(core, numberState as never, [0, 0], 100, 20, 2)).toBe(88);
  });

  it('does not calculate an overflow area when text measurement services are unavailable', () => {
    const editor = createEditor();
    const core = { configEngine: { getDefaultConfig: () => ({ defaultCellAlign: SheetHorizontalAlignment.Right }) } };
    const state = { sheetData: { getItem: () => ({ value: 'overflow' }) } };

    expect(editor.computeOverflowLeftX(core, state, [0, 0], 100, 20, 2)).toBe(100);
  });

  it('returns cell boundary for unsupported values even when alignment is not left', () => {
    const editor = createEditor();
    const core = { configEngine: { getDefaultConfig: () => ({ defaultCellAlign: SheetHorizontalAlignment.Center }) } };
    const state = { sheetData: { getItem: () => ({ value: { unsupported: true } }) } };

    expect(editor.computeOverflowLeftX(core, state, [0, 0], 77, 30, 2)).toBe(77);
  });

  it('returns cell boundary when non-left alignment has empty text', () => {
    const editor = createEditor();
    const core = { configEngine: { getDefaultConfig: () => ({ defaultCellAlign: SheetHorizontalAlignment.Right }) } };
    const state = { sheetData: { getItem: () => ({ value: '' }) } };

    expect(editor.computeOverflowLeftX(core, state, [0, 0], 64, 30, 2)).toBe(64);
  });

  it('falls back to left alignment when explicit and default align are both missing', () => {
    const editor = createEditor();
    const core = { configEngine: { getDefaultConfig: () => ({}) } };
    const state = {
      cellAlignments: { getItem: () => void 0 },
      sheetData: { getItem: () => ({ value: 'text' }) },
    };

    expect(editor.computeOverflowLeftX(core as never, state as never, [0, 0], 33, 30, 2)).toBe(33);
  });

  it('returns cell boundary when sheet data item is missing', () => {
    const editor = createEditor();
    const core = { configEngine: { getDefaultConfig: () => ({ defaultCellAlign: SheetHorizontalAlignment.Right }) } };
    const state = { sheetData: { getItem: () => void 0 } };

    expect(editor.computeOverflowLeftX(core as never, state as never, [0, 0], 40, 30, 2)).toBe(40);
  });

  it('keeps boundary when alignment is an unrecognized value and when text does not overflow left', () => {
    container.registerInstance(TextShaper.symbol, { shape: () => ({ width: 4 }) } as never);

    const editor = createEditor();
    const core = { configEngine: { getDefaultConfig: () => ({ defaultCellAlign: 'unknown' as never }) } };
    const state = { sheetData: { getItem: () => ({ value: 'x' }) } };

    expect(editor.computeOverflowLeftX(core as never, state as never, [0, 0], 20, 40, 2)).toBe(20);
  });
});
