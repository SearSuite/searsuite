import { SheetFindReplaceError, SheetFindReplaceErrorCode } from './SheetFindReplaceError';
import { type SheetFindMatch, type SheetFindPage, type SheetFindPageInput } from './FindReplaceTypes';
import { compareSheetMatches, forEachSheetMatch, type SheetFindSource } from './findSheetMatches';

/** Bounds the memory used by a single Sheet search page. */
export const MAX_SHEET_FIND_PAGE_SIZE = 200;

/** Finds a bounded window while still reporting the complete match count. */
export function findSheetMatchPage(input: SheetFindPageInput, source: SheetFindSource): SheetFindPage {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_SHEET_FIND_PAGE_SIZE) {
    throw new SheetFindReplaceError(SheetFindReplaceErrorCode.InvalidPage, 'Find page size is invalid.', {
      limit: input.limit, maxLimit: MAX_SHEET_FIND_PAGE_SIZE,
    });
  }
  const revision = source.getRevision?.() ?? 0;
  if (input.expectedRevision !== undefined && input.expectedRevision !== revision) {
    throw new SheetFindReplaceError(SheetFindReplaceErrorCode.StaleResults, 'Find results changed.', {
      expectedRevision: input.expectedRevision, revision,
    });
  }
  const compare = (left: SheetFindMatch, right: SheetFindMatch): number =>
    compareSheetMatches(left, right, input.order);
  const worse = (left: SheetFindMatch, right: SheetFindMatch): boolean =>
    input.backward ? compare(left, right) < 0 : compare(left, right) > 0;
  const heap: SheetFindMatch[] = [];
  let total = 0;
  let eligible = 0;
  forEachSheetMatch(input, source, (match) => {
    total += 1;
    if (input.cursor) {
      const relative = compareSheetMatches(match, input.cursor, input.order);
      if (input.backward ? relative >= 0 : relative <= 0) return;
    }
    eligible += 1;
    if (heap.length < input.limit) {
      heap.push(match);
      siftUp(heap, heap.length - 1, worse);
    } else if (worse(heap[0], match)) {
      heap[0] = match;
      siftDown(heap, 0, worse);
    }
  });
  heap.sort(compare);
  return {
    matches: heap,
    startIndex: input.backward ? eligible - heap.length : total - eligible,
    total,
    revision,
  };
}

function siftUp(heap: SheetFindMatch[], index: number, worse: (left: SheetFindMatch, right: SheetFindMatch) => boolean): void {
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!worse(heap[index], heap[parent])) break;
    [heap[index], heap[parent]] = [heap[parent], heap[index]];
    index = parent;
  }
}

function siftDown(heap: SheetFindMatch[], index: number, worse: (left: SheetFindMatch, right: SheetFindMatch) => boolean): void {
  while (index * 2 + 1 < heap.length) {
    const left = index * 2 + 1;
    const right = left + 1;
    let child = left;
    if (right < heap.length && worse(heap[right], heap[left])) child = right;
    if (!worse(heap[child], heap[index])) break;
    [heap[index], heap[child]] = [heap[child], heap[index]];
    index = child;
  }
}
