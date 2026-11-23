import { type StructureInsertDeleteChange } from './StructureInsertDeleteChange';
import { type StructureMoveChange } from './StructureMoveChange';

/** Public contract for one formula-aware structure change. */
export type StructureChange = StructureInsertDeleteChange | StructureMoveChange;
