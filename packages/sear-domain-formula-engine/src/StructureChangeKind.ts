/** Semantic kind of one formula structure change. */
export const StructureChangeKind = { Insert: 'insert', Delete: 'delete', Move: 'move' } as const;

/** Type contract carried by StructureChangeKind. */
export type StructureChangeKind = (typeof StructureChangeKind)[keyof typeof StructureChangeKind];
