import { type CellProperties } from './Cell';
import { type CellVisualLayer } from '@searsuite/sear-render-node';

/** Coordinates supplied to one visual reader for a rendered Sheet cell. */
export interface SheetCellVisualReadPosition {
  readonly rowIndex: number;
  readonly columnIndex: number;
}

/** Plugin-owned reader declaring exclusive ownership of base visual properties. */
export interface SheetCellVisualReader {
  readonly id: string;
  readonly properties: readonly (keyof CellProperties)[];
  read(position: SheetCellVisualReadPosition): Readonly<Partial<CellProperties>>;
}

/**
 * Conditional visual overrides applied after base readers, lowest priority first.
 * Omitted or undefined properties preserve the previously composed value.
 * Readers at the same priority must declare disjoint property sets.
 */
export interface SheetCellVisualOverride extends SheetCellVisualReader {
  readonly priority: number;
}

/** A rectangle positioned within a cell using fractions of its width and height. */
export type SheetCellVisualLayer = CellVisualLayer;

/** One matched conditional rule; higher priority wins for overlapping properties and layer slots. */
export interface SheetCellConditionalVisual {
  readonly id: string;
  readonly priority: number;
  readonly properties?: Readonly<Partial<CellProperties>>;
  readonly layers?: readonly SheetCellVisualLayer[];
}

export interface SheetCellConditionalVisualReader {
  readonly id: string;
  readonly properties: readonly (keyof CellProperties)[];
  /** Reads the owner's current rule order after staged transactions commit. */
  readHighestPriority?(): number;
  read(position: SheetCellVisualReadPosition): readonly SheetCellConditionalVisual[];
}

/** Minimal configuration access available while plugins register visual readers. */
export interface SheetCellVisualReaderRegistrationContext {
  readDefaultConfig(): Readonly<Record<string, unknown>>;
}
