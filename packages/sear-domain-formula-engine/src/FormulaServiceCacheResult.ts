import { FormulaServiceCacheStatus } from './FormulaServiceCacheStatus';

/** Synchronous cache result; asynchronous work stays outside formula evaluation. */
export type FormulaServiceCacheResult<T> =
  | { readonly status: typeof FormulaServiceCacheStatus.Ready; readonly value: T }
  | { readonly status: typeof FormulaServiceCacheStatus.Pending | typeof FormulaServiceCacheStatus.Unavailable };
