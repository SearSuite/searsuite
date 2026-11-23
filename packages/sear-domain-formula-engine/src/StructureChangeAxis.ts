/** Axis affected by one formula structure change. */
export const StructureChangeAxis = { Row: 'row', Col: 'col' } as const;

/** Type contract carried by StructureChangeAxis. */
export type StructureChangeAxis = (typeof StructureChangeAxis)[keyof typeof StructureChangeAxis];
