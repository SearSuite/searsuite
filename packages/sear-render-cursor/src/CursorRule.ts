import { CellRegion } from '@searsuite/sear-render-registry';
import { CellProperties } from '@searsuite/sear-render-registry';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { EventWithOffset } from '@searsuite/sear-render-event-engine';
import { CursorToken } from './CursorToken';

export const CursorRuleKind = {
  Region: 'region',
  Type: 'type',
  Predicate: 'predicate',
  Position: 'position',
} as const;

/** Pointer coordinates supplied to a position cursor rule for one pointer event. */
export interface CursorPosition {
  /** Sheet core whose current data and interaction state may inform the cursor decision. */
  core: SearCoreSheet;
  /** Original host pointer event. */
  origin: EventWithOffset;
  /** Pointer location relative to the rendered viewport. */
  view: { x: number; y: number };
  /** Pointer location in scrollable sheet-world coordinates. */
  world: { x: number; y: number };
  /** Hit-tested cell properties, or null when the pointer is not over a scene node. */
  target: CellProperties | null;
}

export const CursorRulePriority = {
  High: 'high',
  Low: 'low',
} as const;

/** Exact region-match rule (highest priority among structural rules). */
export interface RegionCursorRule {
  /** Optional extension key; defaults to the region identifier. */
  key?: string | symbol;
  kind: typeof CursorRuleKind.Region;
  region: CellRegion;
  cursor: CursorToken;
}

/** Type-field match rule (secondary match). */
export interface TypeCursorRule {
  /** Optional extension key; defaults to the cell type. */
  key?: string | symbol;
  kind: typeof CursorRuleKind.Type;
  cellType: string | symbol;
  cursor: CursorToken;
}

/**
 * Fully custom predicate rule.
 *
 * priority: 'high' → evaluated before region/type rules (e.g., isEdit override).
 * priority: 'low'  → evaluated after region/type rules as a fallback (default).
 */
export interface PredicateCursorRule {
  /** Predicates need an explicit key to replace a previous predicate rule. */
  key?: string | symbol;
  kind: typeof CursorRuleKind.Predicate;
  priority?: (typeof CursorRulePriority)[keyof typeof CursorRulePriority];
  test: (properties: CellProperties) => boolean;
  cursor: CursorToken;
}

/**
 * Cursor rule evaluated from the pointer location rather than a hit node.
 * Higher layers win over lower layers and all structural cursor rules. When
 * multiple matching rules share the highest layer, the last registered rule
 * wins and CursorRegistry reports the ambiguous registration once.
 */
export interface PositionCursorRule {
  /** Stable owner key used for replacement, removal, and conflict diagnostics. */
  key: string | symbol;
  kind: typeof CursorRuleKind.Position;
  /** Precedence among position rules; larger values take precedence. */
  layer: number;
  /** Returns whether this rule owns the supplied pointer location. */
  test: (position: CursorPosition) => boolean;
  /** Logical cursor presented while this rule owns the pointer. */
  cursor: CursorToken;
}

/** Type contract for CursorRule. */
export type CursorRule = RegionCursorRule | TypeCursorRule | PredicateCursorRule | PositionCursorRule;
