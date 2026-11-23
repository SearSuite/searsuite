import { RectOT, type MatrixStructureOTOperation } from '@searsuite/sear-domain-ot';
import { Rect } from '@searsuite/sear-foundation-rect';
import { type SheetFilterDefinition } from './SheetFilterTypes';

/** Keeps the filter range and column keys aligned with Sheet structure operations. */
export function projectSheetFilterDefinition(
  definition: SheetFilterDefinition,
  operation: MatrixStructureOTOperation<unknown>,
): SheetFilterDefinition | null {
  const rect = new Rect([[...definition.range.start], [...definition.range.end]]);
  RectOT.apply(rect, [operation]);
  const start = rect.getPoint(0);
  const end = rect.getPoint(1);
  if (start[0] > end[0] || start[1] > end[1]) return null;
  const rules = definition.rules.flatMap((rule) => {
    const cell = new Rect([[definition.range.start[0], rule.column], [definition.range.start[0], rule.column]]);
    RectOT.apply(cell, [operation]);
    const column = cell.getPoint(0)[1];
    return column >= start[1] && column <= end[1] ? [{ ...rule, column }] : [];
  });
  return {
    ...definition, range: { start: [...start] as [number, number], end: [...end] as [number, number] }, rules,
  };
}
