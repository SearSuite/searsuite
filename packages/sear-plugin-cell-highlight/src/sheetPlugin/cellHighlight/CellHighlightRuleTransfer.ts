import { subtractSheetMoveRange, type PluginKey, type SheetFormatRange, type SheetFormatTransferContribution } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { type CellHighlightMatrix, type PositionedCellHighlightRule } from '../../CellHighlightMatrix';
import { type CellHighlightRule } from '../../CellHighlightRule';

type Bounds = readonly [number, number, number, number];

interface CapturedRule {
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly rule: CellHighlightRule;
}

interface CapturedHighlightRules {
  readonly width: number;
  readonly height: number;
  readonly rules: readonly CapturedRule[];
}

export function createReplaceCellHighlightRuleOperations(
  matrix: CellHighlightMatrix,
  bounds: Bounds | null,
  createId: () => string,
  additions: readonly PositionedCellHighlightRule[] = [],
): UpdateCellOTOperation<CellHighlightRule[] | null>[] {
  const updates = new Map<string, { row: number; column: number; next: CellHighlightRule[] | null }>();
  const readNext = (row: number, column: number): CellHighlightRule[] => {
    const key = `${row}:${column}`;
    return (updates.has(key) ? updates.get(key)!.next : matrix.getItem(row, column)) ?? [];
  };
  const writeNext = (row: number, column: number, next: CellHighlightRule[]) =>
    updates.set(`${row}:${column}`, { row, column, next: next.length ? next : null });
  for (const { row, column, rule } of matrix.getRules()) {
    if (bounds && (row > bounds[2] || column > bounds[3] || rule.endRow < bounds[0] || rule.endColumn < bounds[1])) continue;
    writeNext(row, column, readNext(row, column).filter((candidate) => candidate.id !== rule.id));
    if (!bounds) continue;
    for (const remainder of subtractSheetMoveRange(
      { start: [row, column], end: [rule.endRow, rule.endColumn] },
      { start: [bounds[0], bounds[1]], end: [bounds[2], bounds[3]] },
    )) {
      const [top, left] = remainder.start;
      const fragment = { ...rule, id: createId(), endRow: remainder.end[0], endColumn: remainder.end[1] };
      writeNext(top, left, [...readNext(top, left), fragment]);
    }
  }
  for (const { row, column, rule } of additions) {
    writeNext(row, column, [...readNext(row, column), rule]);
  }
  return [...updates.values()].map(({ row, column, next }) =>
    createUpdateCellOTOperation([row, column], next, matrix.getItem(row, column)));
}

export function createCellHighlightFormatTransfer(
  target: PluginKey,
  readMatrix: () => CellHighlightMatrix,
  createId: () => string,
  nextPriority?: () => number,
): SheetFormatTransferContribution {
  const planCaptured = (captured: CapturedHighlightRules, destination: SheetFormatRange) => {
    const matrix = readMatrix();
    const bounds: Bounds = [destination.start[0], destination.start[1], destination.end[0], destination.end[1]];
    let priority = matrix.getRules().reduce((max, entry) => Math.max(max, entry.rule.priority), 0);
    const additions: PositionedCellHighlightRule[] = [];
    const append = (capturedRule: CapturedRule, row: number, column: number, endRow: number, endColumn: number) => {
      additions.push({ row, column, rule: {
        ...capturedRule.rule, id: createId(), priority: nextPriority?.() ?? ++priority,
        endRow, endColumn, condition: { ...capturedRule.rule.condition },
      } });
    };
    if (captured.width === 1 && captured.height === 1) {
      captured.rules.forEach((entry) => append(entry, ...destination.start, ...destination.end));
    } else {
      for (let row = destination.start[0]; row <= destination.end[0]; row += captured.height) {
        for (let column = destination.start[1]; column <= destination.end[1]; column += captured.width) {
          for (const entry of captured.rules) {
            const startRow = row + entry.start[0];
            const startColumn = column + entry.start[1];
            if (startRow > destination.end[0] || startColumn > destination.end[1]) continue;
            append(entry, startRow, startColumn,
              Math.min(row + entry.end[0], destination.end[0]),
              Math.min(column + entry.end[1], destination.end[1]));
          }
        }
      }
    }
    const operations = createReplaceCellHighlightRuleOperations(matrix, bounds, createId, additions);
    return operations.length ? [{ target, operations }] : [];
  };
  return {
    id: 'sheet.cellHighlight',
    capture(source) {
      const rules = readMatrix().getRules().flatMap(({ row, column, rule }): CapturedRule[] => {
        const top = Math.max(row, source.start[0]);
        const left = Math.max(column, source.start[1]);
        const bottom = Math.min(rule.endRow, source.end[0]);
        const right = Math.min(rule.endColumn, source.end[1]);
        return top > bottom || left > right ? [] : [{
          start: [top - source.start[0], left - source.start[1]],
          end: [bottom - source.start[0], right - source.start[1]],
          rule,
        }];
      });
      const portable: CapturedHighlightRules = {
        width: source.end[1] - source.start[1] + 1,
        height: source.end[0] - source.start[0] + 1,
        rules,
      };
      return { portable, plan: (destination) => planCaptured(portable, destination) };
    },
    planCaptured: (portable, destination) => planCaptured(portable as CapturedHighlightRules, destination),
    clear: (range) => {
      const operations = createReplaceCellHighlightRuleOperations(readMatrix(), [
        range.start[0], range.start[1], range.end[0], range.end[1],
      ], createId);
      return operations.length ? [{ target, operations }] : [];
    },
  };
}
