/** Type contract for SelectionPoint. */
export type SelectionPoint = readonly [number, number];

/** Public contract for SelectRangeCommandInput. */
export interface SelectRangeCommandInput {
  readonly start: SelectionPoint;
  readonly end: SelectionPoint;
  readonly findMerge: (point: SelectionPoint) => { start: SelectionPoint; end: SelectionPoint } | undefined;
  readonly lastRow?: number | undefined;
  readonly lastCol?: number | undefined;
}

/** Public contract for SelectRangeCommandResult. */
export interface SelectRangeCommandResult {
  readonly anchor: [number, number];
  readonly focus: [number, number];
}

/** Normalizes pointer or test-provided ranges so intersected merged cells are selected whole. */
export function selectRange(input: SelectRangeCommandInput): SelectRangeCommandResult {
  let top = Math.min(input.start[0], input.end[0]);
  let left = Math.min(input.start[1], input.end[1]);
  let bottom = Math.max(input.start[0], input.end[0]);
  let right = Math.max(input.start[1], input.end[1]);
  const maxRow = input.lastRow ?? Number.POSITIVE_INFINITY;
  const maxCol = input.lastCol ?? Number.POSITIVE_INFINITY;
  function clampSelectionRow(row: number): number {
    return Math.min(Math.max(0, row), maxRow);
  }
  function clampSelectionColumn(col: number): number {
    return Math.min(Math.max(0, col), maxCol);
  }
  let changed = true;
  while (changed) {
    changed = false;
    const scanBottom = bottom;
    const scanRight = right;
    for (let row = top; row <= scanBottom; row++)
      for (let col = left; col <= scanRight; col++) {
        const merge = input.findMerge([row, col]);
        if (!merge) continue;
        const nextTop = clampSelectionRow(Math.min(top, merge.start[0]));
        const nextLeft = clampSelectionColumn(Math.min(left, merge.start[1]));
        const nextBottom = clampSelectionRow(Math.max(bottom, merge.end[0]));
        const nextRight = clampSelectionColumn(Math.max(right, merge.end[1]));
        changed ||= nextTop !== top || nextLeft !== left || nextBottom !== bottom || nextRight !== right;
        top = nextTop;
        left = nextLeft;
        bottom = nextBottom;
        right = nextRight;
      }
  }
  return { anchor: [top, left], focus: [bottom, right] };
}
