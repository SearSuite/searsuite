import { SheetBorderLineStyle } from './SheetCellBorder';

/** Paint projection of one persisted border style. */
export interface BorderLinePaint {
  readonly width: number;
  readonly dash: readonly number[];
  readonly double?: boolean;
  readonly slanted?: boolean;
}

/** Shared style projection used by scene nodes and host previews. */
export const BorderLinePaint: Readonly<Record<SheetBorderLineStyle, BorderLinePaint>> = {
  thin: { width: 1, dash: [] },
  medium: { width: 2, dash: [] },
  thick: { width: 3, dash: [] },
  dashed: { width: 1, dash: [6, 3] },
  dotted: { width: 1, dash: [1, 2] },
  dashDot: { width: 1, dash: [9, 3, 1, 3] },
  dashDotDot: { width: 1, dash: [9, 3, 1, 3, 1, 3] },
  hair: { width: 0.5, dash: [1, 1] },
  mediumDashed: { width: 2, dash: [6, 3] },
  mediumDashDot: { width: 2, dash: [9, 3, 1, 3] },
  mediumDashDotDot: { width: 2, dash: [9, 3, 1, 3, 1, 3] },
  double: { width: 1, dash: [], double: true },
  slantedDashDot: { width: 2, dash: [9, 3, 1, 3], slanted: true },
};
