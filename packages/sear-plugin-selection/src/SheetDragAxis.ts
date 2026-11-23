/** Canonical axes for complete row/column selection gestures. */
export const SheetDragAxis = { Row: 0, Column: 1 } as const;
export type SheetDragAxis = (typeof SheetDragAxis)[keyof typeof SheetDragAxis];
