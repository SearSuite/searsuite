import { SheetBorderSide } from './SheetCellBorder';

/** Adjacent cell and opposite edge for every canonical border side. */
export const CellBorderNeighbors: Readonly<Record<SheetBorderSide, readonly [number, number, SheetBorderSide]>> = {
  [SheetBorderSide.Top]: [-1, 0, SheetBorderSide.Bottom],
  [SheetBorderSide.Bottom]: [1, 0, SheetBorderSide.Top],
  [SheetBorderSide.Left]: [0, -1, SheetBorderSide.Right],
  [SheetBorderSide.Right]: [0, 1, SheetBorderSide.Left],
};
