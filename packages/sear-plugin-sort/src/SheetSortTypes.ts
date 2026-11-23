import { type SheetMoveRange } from '@searsuite/sear-assembly-plugin';

export enum SheetSortDirection { Ascending = 'ascending', Descending = 'descending' }

export interface SheetSortKey {
  readonly column: number;
  readonly direction: SheetSortDirection;
}

export interface SheetSortRangeInput {
  readonly range: SheetMoveRange;
  readonly keys: readonly SheetSortKey[];
  readonly firstRowIsHeader?: boolean;
}

export type SheetSortValue = number | string | boolean | null;
