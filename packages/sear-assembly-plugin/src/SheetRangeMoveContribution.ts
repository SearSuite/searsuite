import { type Operation } from '@searsuite/sear-domain-ot';
import { type PluginKey } from './PluginKey';

/** Zero-based inclusive bounds of a cell range. */
export interface SheetMoveRange {
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
}

/** Normalized source and destination of a same-sheet cell move. */
export interface SheetRangeMoveContext {
  readonly source: SheetMoveRange;
  readonly destination: SheetMoveRange;
}

/** Operations produced by one state owner without mutating its live state. */
export interface SheetRangeMovePlan {
  readonly target: PluginKey;
  readonly operations: readonly Operation[];
}

/** A state owner's participation in range moves, independent of storage representation. */
export interface SheetRangeMoveContribution {
  /** Unique registration identity, conventionally `<owner>.rangeMove`; not a document field or operation target. */
  readonly id: string;
  /** Reads owner-specific invariants without mutation; rejected constraints throw a SearError. */
  validate?(context: SheetRangeMoveContext): void;
  /** Reports whether destination data outside the source would be replaced. */
  hasConflict?(context: SheetRangeMoveContext): boolean;
  /** Reads current state and produces an isolated operation plan. */
  plan(context: SheetRangeMoveContext): readonly SheetRangeMovePlan[];
  /** Rewrites plans after every state owner has contributed, for derived references. */
  transformPlans?(context: SheetRangeMoveContext, plans: readonly SheetRangeMovePlan[]): readonly SheetRangeMovePlan[];
}

/** Tests inclusive range membership. */
export function isPointInSheetMoveRange(range: SheetMoveRange, row: number, column: number): boolean {
  return row >= range.start[0] && row <= range.end[0] && column >= range.start[1] && column <= range.end[1];
}
