/** The source searched in a cell. */
export const SheetFindContent = { Value: 'value', Formula: 'formula' } as const;
/** Supported cell content projections for search. */
export type SheetFindContent = (typeof SheetFindContent)[keyof typeof SheetFindContent];

/** Row-major or column-major traversal of matching cells. */
export const SheetFindOrder = { Rows: 'rows', Columns: 'columns' } as const;
/** Supported match traversal orders. */
export type SheetFindOrder = (typeof SheetFindOrder)[keyof typeof SheetFindOrder];

/** Inclusive cell bounds for a Sheet search. */
export interface SheetFindRange {
  /** First row and column. */
  readonly start: readonly [number, number];
  /** Last row and column. */
  readonly end: readonly [number, number];
}

/** Query options shared by navigation and replacement. */
export interface SheetFindInput {
  /** Search text with Excel-style *, ? and ~ escapes; an empty string produces no matches. */
  readonly text: string;
  /** Whether to read displayed values or formula source. */
  readonly content?: SheetFindContent;
  /** Cell traversal order. */
  readonly order?: SheetFindOrder;
  /** Enables case-sensitive matching. */
  readonly matchCase?: boolean;
  /** Requires the search text to equal the entire cell text. */
  readonly entireCell?: boolean;
  /** Limits search to an inclusive rectangular cell range. */
  readonly range?: SheetFindRange;
  /** Limits search to multiple selected rectangles; overlapping cells are visited once. */
  readonly ranges?: readonly SheetFindRange[];
}

/** One occurrence, with UTF-16 offsets within the cell's searched text. */
export interface SheetFindMatch {
  /** Zero-based row coordinate. */
  readonly row: number;
  /** Zero-based column coordinate. */
  readonly column: number;
  /** Inclusive UTF-16 offset. */
  readonly start: number;
  /** Exclusive UTF-16 offset. */
  readonly end: number;
  /** Searched cell text at query time. */
  readonly text: string;
  /** Whether the source row is currently hidden by a filter. */
  readonly hidden?: boolean;
}

/** A bounded window of matches in the requested traversal order. */
export interface SheetFindPageInput extends SheetFindInput {
  /** Maximum number of matches returned. */
  readonly limit: number;
  /** Exclusive position from which to continue. */
  readonly cursor?: Pick<SheetFindMatch, 'row' | 'column' | 'start'>;
  /** Reads the matches preceding the cursor when set. */
  readonly backward?: boolean;
  /** Rejects a cursor created before the Sheet data changed. */
  readonly expectedRevision?: number;
}

/** Match window and its position in the complete result set. */
export interface SheetFindPage {
  readonly matches: readonly SheetFindMatch[];
  readonly startIndex: number;
  readonly total: number;
  readonly revision: number;
}

/** Replacement options shared by single and bulk commands. */
export interface SheetReplaceInput extends SheetFindInput {
  /** Literal text inserted for each matching occurrence. */
  readonly replacement: string;
}

/** Replaces one match returned by the find query. */
export interface SheetReplaceOneInput extends SheetReplaceInput {
  /** Selected occurrence, including the cell text observed by the find query. */
  readonly match: SheetFindMatch;
}
