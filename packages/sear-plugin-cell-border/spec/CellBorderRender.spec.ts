import { HeadlessRenderContext } from '@searsuite/sear-render-context';
import { RowShapeDimensionsCSRMatrix, ColumnShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { SheetRowSizesFieldKey, SheetColumnSizesFieldKey } from '@searsuite/sear-render-engine';
import { CellMergeMatrix, SheetCellMergeFieldKey } from '@searsuite/sear-plugin-cell-merge';
import { CellBorderMatrix, SheetBorderLineStyle, BorderLinePaint } from '../src';
import { CellBorderLineNode } from '../src/CellBorderLineNode';
import { renderCellBorders } from '../src/renderCellBorders';
import { planCellBorders } from '../src/CellBorderPlanning';
import { SheetBorderPreset } from '../src';
import { MatrixOT } from '@searsuite/sear-domain-ot';

describe('Border rendering', () => {
  it.each(Object.values(SheetBorderLineStyle))('paints %s without hit output or leaked paint state', (style) => {
    const context = new HeadlessRenderContext();
    const save = jest.spyOn(context, 'save');
    const restore = jest.spyOn(context, 'restore');
    const dash = jest.spyOn(context, 'setLineDash');
    const width = jest.spyOn(context, 'setLineWidth');
    const stroke = jest.spyOn(context, 'stroke');
    const node = new CellBorderLineNode({ x1: 50, y1: 24, x2: 150, y2: 24 }, { color: '#000000', style });
    node.drawScene(context);
    node.drawHit();
    expect(save).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(dash).toHaveBeenCalledWith([...BorderLinePaint[style].dash]);
    expect(width).toHaveBeenCalledWith(BorderLinePaint[style].width);
    expect(stroke).toHaveBeenCalledTimes(BorderLinePaint[style].double || BorderLinePaint[style].slanted ? 2 : 1);
    expect(node.positionRect.height).toBeGreaterThan(0);
    expect(node.properties.skipHit).toBe(true);
  });

  it('leaves a visible gap between both strokes of horizontal and vertical double borders', () => {
    for (const line of [
      { x1: 50, y1: 24, x2: 150, y2: 24 },
      { x1: 50, y1: 24, x2: 50, y2: 48 },
    ]) {
      const context = new HeadlessRenderContext();
      const moveTo = jest.spyOn(context, 'moveTo');
      const lineTo = jest.spyOn(context, 'lineTo');
      new CellBorderLineNode(line, { color: '#ff0000', style: SheetBorderLineStyle.Double }).drawScene(context);
      if (line.y1 === line.y2) {
        expect(moveTo.mock.calls).toEqual([[50, 22], [50, 26]]);
        expect(lineTo.mock.calls).toEqual([[150, 22], [150, 26]]);
      } else {
        expect(moveTo.mock.calls).toEqual([[48, 24], [52, 24]]);
        expect(lineTo.mock.calls).toEqual([[48, 48], [52, 48]]);
      }
    }
  });

  it('deduplicates shared edges, honors offsets and hides merged interiors', () => {
    const rows = new RowShapeDimensionsCSRMatrix(void 0, [1, 3]);
    const columns = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 3]);
    rows.setDefaultValue(24);
    columns.setDefaultValue(100);
    const merges = new CellMergeMatrix(void 0, [3, 3]);
    const matrix = new CellBorderMatrix(void 0, [3, 3]);
    MatrixOT.apply(
      matrix,
      planCellBorders(matrix, { start: [0, 0], end: [1, 1] }, SheetBorderPreset.All, {
        color: '#000000',
        style: SheetBorderLineStyle.Thin,
      }),
    );
    const core = {
      getDataEngine: () => ({
        readDataViewField: (_namespace: string, key: string) =>
          key === SheetRowSizesFieldKey
            ? rows
            : key === SheetColumnSizesFieldKey
            ? columns
            : key === SheetCellMergeFieldKey
            ? merges
            : null,
      }),
      configEngine: { getDefaultConfig: () => ({ sheetOffsetX: 84, sheetOffsetY: 36 }) },
      renderEngine: { scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [400, 300] } },
    };
    matrix.setItem(0, 0, { ...matrix.getItem(0, 0), bottom: { color: '#ff0000', style: SheetBorderLineStyle.Thick } });
    const ordinary = renderCellBorders(core as never, matrix);
    expect(ordinary).toHaveLength(12);
    const context = new HeadlessRenderContext();
    const move = jest.spyOn(context, 'moveTo');
    const stroke = jest.spyOn(context, 'setStrokeStyle');
    ordinary.forEach((node) => node.drawScene(context));
    expect(move).toHaveBeenCalledWith(84, 36);
    expect(stroke).not.toHaveBeenCalledWith('#ff0000');
    merges.setItem(0, 0, { endRow: 1, endColumn: 1 });
    expect(renderCellBorders(core as never, matrix)).toHaveLength(8);
    expect(
      renderCellBorders({ ...core, getDataEngine: () => ({ readDataViewField: () => null }) } as never, matrix),
    ).toEqual([]);
  });
});
