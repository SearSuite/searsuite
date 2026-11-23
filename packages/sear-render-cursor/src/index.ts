/**
 * Portable cursor policies with Web and headless host adapters.
 *
 * @packageDocumentation
 */

export { CursorToken } from './CursorToken';
export { CursorEngine } from './CursorEngine';
export { HeadlessCursorEngine } from './HeadlessCursorEngine';
export {
  CursorRuleKind,
  CursorRulePriority,
  type CursorPosition,
  type CursorRule,
  type RegionCursorRule,
  type TypeCursorRule,
  type PredicateCursorRule,
  type PositionCursorRule,
} from './CursorRule';
export { CursorRegistry } from './CursorRegistry';
export { SheetCursorPlugin } from './sheetCursor/SheetCursorPlugin';
