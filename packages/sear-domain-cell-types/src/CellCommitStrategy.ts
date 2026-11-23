import { type RichDocNode } from '@searsuite/sear-domain-doc';
import { type CellMatrixElement } from './CellMatrixElement';
import { type CellFormat, type CellFormatLocale } from './CellFormat';

/** Input available when the cell editor commits one edited cell. */
export interface CellCommitContext {
  row: number;
  col: number;
  plainText: string;
  richText: RichDocNode[];
  previous: CellMatrixElement | null;
  /** Explicit format read from the Sheet cell-format state owner. */
  format?: CellFormat | null;
  /** Locale used to interpret the formatted editor text. */
  formatLocale?: CellFormatLocale;
}

/** Contract for deciding how editor input becomes persisted cell data. */
export interface CellCommitStrategyDefinition {
  readonly key: string;
  readonly priority: number;

  matches(context: CellCommitContext): boolean;
  commit(context: CellCommitContext): CellMatrixElement | null;
  inferFormat?(context: CellCommitContext): CellFormat | null;
}

/** Base class for reusable strategies; plain definitions can also be registered. */
export abstract class CellCommitStrategy implements CellCommitStrategyDefinition {
  /** Stable identifier for this commit strategy. */
  abstract readonly key: string;
  /** Ordering priority used when more than one strategy matches. */
  abstract readonly priority: number;

  /** Reports whether this strategy can commit the supplied input. */
  abstract matches(context: CellCommitContext): boolean;
  /** Converts matching edit input into a persisted cell value. */
  abstract commit(context: CellCommitContext): CellMatrixElement | null;
}
