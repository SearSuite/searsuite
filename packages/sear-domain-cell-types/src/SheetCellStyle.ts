import { type SheetHorizontalAlignment } from './SheetHorizontalAlignment';
import { type SheetVerticalAlignment } from './SheetVerticalAlignment';

/** Queryable cell appearance, independent of nodes, coordinates, layout, and drawing APIs. */
export interface SheetCellStyle {
  /** Optional cell background color, independent of drawing geometry. */
  readonly fill?: string | undefined;
  /** Optional foreground color of displayed cell text. */
  readonly textColor?: string | undefined;
  /** Optional semantic outline color. */
  readonly stroke?: string | undefined;
  /** Optional number or display format interpreted by cell-type providers. */
  readonly format?: unknown;
  /** Horizontal text alignment used by semantic display projections. */
  readonly horizontalAlign?: SheetHorizontalAlignment | undefined;
  /** Vertical text alignment used by semantic display projections. */
  readonly verticalAlign?: SheetVerticalAlignment | undefined;
}

/** Semantic style query shared by filters, automation, and views. */
export interface SheetCellStyleReader {
  /** Reads the composed semantic style for one cell without exposing drawing types. */
  read(row: number, column: number): Readonly<SheetCellStyle>;
}

/** A feature-owned contribution with exclusive ownership of its base properties. */
export interface SheetCellStyleSource {
  /** Stable identifier used for registration, priority ties and disposal. */
  readonly id: string;
  /** Semantic style properties this contribution is authorized to supply. */
  readonly properties: readonly (keyof SheetCellStyle)[];
  /** Reads the composed semantic style for one cell without exposing drawing types. */
  read(row: number, column: number): Readonly<SheetCellStyle>;
}

export interface SheetCellStyleOverride extends SheetCellStyleSource {
  /** Deterministic rule priority; later matching priorities override earlier values. */
  readonly priority: number;
}

/** One conditional appearance produced by a feature's rule evaluation. */
export interface SheetCellStyleMatch {
  /** Stable identifier used for registration, priority ties and disposal. */
  readonly id: string;
  /** Deterministic rule priority; later matching priorities override earlier values. */
  readonly priority: number;
  /** Semantic style properties this contribution is authorized to supply. */
  readonly properties: Readonly<SheetCellStyle>;
}

export interface SheetCellStyleRuleSource {
  /** Stable identifier used for registration, priority ties and disposal. */
  readonly id: string;
  /** Semantic style properties this contribution is authorized to supply. */
  readonly properties: readonly (keyof SheetCellStyle)[];
  /** Reads the composed semantic style for one cell without exposing drawing types. */
  read(row: number, column: number): readonly SheetCellStyleMatch[];
}

/** Theme-independent defaults used by semantic style projections. */
export interface SheetCellStyleDefaults {
  /** Reads the composed semantic style for one cell without exposing drawing types. */
  read(): Readonly<SheetCellStyle>;
}
