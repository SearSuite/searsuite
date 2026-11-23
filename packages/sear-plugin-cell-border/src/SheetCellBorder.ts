/** Supported border presets for an inclusive Sheet range. */
export const SheetBorderPreset = {
  None: 'none',
  All: 'all',
  Outside: 'outside',
  Inside: 'inside',
  Top: 'top',
  Bottom: 'bottom',
  Left: 'left',
  Right: 'right',
  Horizontal: 'horizontal',
  Vertical: 'vertical',
} as const;
/** Border preset input contract. */
export type SheetBorderPreset = (typeof SheetBorderPreset)[keyof typeof SheetBorderPreset];

/** Persisted line styles, shared by commands, rendering and hosts. */
export const SheetBorderLineStyle = {
  Thin: 'thin',
  Medium: 'medium',
  Thick: 'thick',
  Dashed: 'dashed',
  Dotted: 'dotted',
  DashDot: 'dashDot',
  DashDotDot: 'dashDotDot',
  Hair: 'hair',
  MediumDashed: 'mediumDashed',
  MediumDashDot: 'mediumDashDot',
  MediumDashDotDot: 'mediumDashDotDot',
  Double: 'double',
  SlantedDashDot: 'slantedDashDot',
} as const;
/** Border line style input contract. */
export type SheetBorderLineStyle = (typeof SheetBorderLineStyle)[keyof typeof SheetBorderLineStyle];

/** Canonical edge names stored in a cell border record. */
export const SheetBorderSide = { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' } as const;
/** Cell border edge contract. */
export type SheetBorderSide = (typeof SheetBorderSide)[keyof typeof SheetBorderSide];

/** One explicit persisted border stroke. */
export interface SheetBorderStroke {
  readonly color: string;
  readonly style: SheetBorderLineStyle;
}
/** Explicit edges belonging to one cell; omitted edges have no custom border. */
export type SheetCellBorder = Readonly<Partial<Record<SheetBorderSide, SheetBorderStroke>>>;
