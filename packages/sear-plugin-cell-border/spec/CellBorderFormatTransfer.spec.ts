import { SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { MatrixOT } from '@searsuite/sear-domain-ot';
import { CellBorderMatrix, SheetCellBorderPlugin, SheetBorderLineStyle } from '../src';

it('copies a visible neighbor-owned source edge and clears conflicting target neighbor edges', () => {
  const borders = new CellBorderMatrix(undefined, [6, 6]);
  const red = { color: '#ff0000', style: SheetBorderLineStyle.Thin };
  const blue = { color: '#0000ff', style: SheetBorderLineStyle.Thick };
  borders.setItem(0, 0, { right: red });
  borders.setItem(2, 1, { right: blue });
  const plugin = new SheetCellBorderPlugin({ cellBorders: borders });
  const registry = new SheetFormatTransferRegistry();
  plugin.registerFormatTransfers(registry);
  const snapshot = registry.capture({ start: [0, 1], end: [0, 1] });
  const portable = JSON.parse(JSON.stringify(registry.capturePortable({ start: [0, 1], end: [0, 1] })));
  const plans = registry.planPortable(portable, { start: [2, 2], end: [2, 2] });
  expect(snapshot.plan({ start: [2, 2], end: [2, 2] })).toEqual(plans);
  MatrixOT.apply(borders, plans[0].operations as never);
  expect(borders.getItem(2, 2)).toEqual({ left: red });
  expect(borders.getItem(2, 1)).toBeNull();
  const blank = registry.capture({ start: [5, 5], end: [5, 5] });
  MatrixOT.apply(borders, blank.plan({ start: [2, 2], end: [2, 2] })[0].operations as never);
  expect(borders.getItem(2, 2)).toBeNull();
});
