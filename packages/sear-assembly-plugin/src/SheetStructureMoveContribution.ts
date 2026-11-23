import { type Operation } from '@searsuite/sear-domain-ot';
import { type PluginKey } from './PluginKey';

/** One original-state row or column structure edit owned by a matrix plugin. */
export interface SheetStructureMoveContext {
  readonly target: PluginKey;
  readonly operations: readonly Operation[];
}

/** Owner-local validation and dependent edits compiled before a structure edit is staged. */
export interface SheetStructureMoveContribution {
  readonly id: string;
  validate?(context: SheetStructureMoveContext): void;
  transformOperations?(context: SheetStructureMoveContext): readonly Operation[];
}
