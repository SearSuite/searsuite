import {
  createSheetTransaction,
  defineSheetCommand,
  defineSheetQuery,
  SheetCommandBus,
  SheetQueryRegistry,
} from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-plugin';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetFilterMatrix } from './SheetFilterMatrix';
import {
  type SheetFilterDefinition,
  type SheetFilterPredicate,
  type SheetFilterValuePage,
  sheetFilterValueKey,
} from './SheetFilterTypes';
import { assertSheetFilterPredicate } from './validateSheetFilterPredicate';

/** Sheet range and header policy for a new filter or private view. */
export interface CreateSheetFilterInput {
  /** Inclusive range to filter. */
  readonly range: SheetFilterDefinition['range'];
  /** Treat the first row as a header when true. */
  readonly firstRowIsHeader?: boolean;
}
/** Sets or clears a predicate for one column. */
export interface SetSheetColumnFilterInput {
  readonly column: number;
  readonly predicate: SheetFilterPredicate | null;
}
/** Replaces several column predicates in one filter transaction. */
export interface SetSheetColumnFiltersInput {
  readonly updates: readonly SetSheetColumnFilterInput[];
}
/** Changes whether the first row of an active filter is a header. */
export interface SetSheetFilterHeaderInput {
  readonly firstRowIsHeader: boolean;
}
/** Parameters for a bounded distinct-value query. */
export interface ReadSheetFilterValuesInput {
  readonly column: number;
  readonly search?: string;
  readonly limit?: number;
  /** Includes blank cells even when a host's visible blank label matches the search text. */
  readonly includeBlank?: boolean;
}

/** Creates a document-owned filter range. */
export const CreateSheetFilterCommand = defineSheetCommand<CreateSheetFilterInput>('sheet.filter.create');
/** Creates a session-owned filter view. */
export const CreateSheetFilterViewCommand = defineSheetCommand<CreateSheetFilterInput>('sheet.filter.createView');
/** Replaces or clears one column predicate. */
export const SetSheetColumnFilterCommand = defineSheetCommand<SetSheetColumnFilterInput>('sheet.filter.setColumn');
/** Replaces several column predicates atomically. */
export const SetSheetColumnFiltersCommand = defineSheetCommand<SetSheetColumnFiltersInput>('sheet.filter.setColumns');
/** Updates the active filter's header policy while preserving its column rules. */
export const SetSheetFilterHeaderCommand = defineSheetCommand<SetSheetFilterHeaderInput>('sheet.filter.setHeader');
/** Clears the active filter or private view. */
export const ClearSheetFilterCommand = defineSheetCommand<void>('sheet.filter.clear');
/** Recomputes visibility for the active filter. */
export const ReapplySheetFilterCommand = defineSheetCommand<void>('sheet.filter.reapply');
/** Reads the active filter definition. */
export const ReadSheetFilterQuery = defineSheetQuery<void, SheetFilterDefinition | null>('sheet.filter.read');
/** Reads a bounded page of distinct displayed values in one column. */
export const ReadSheetFilterValuesQuery = defineSheetQuery<ReadSheetFilterValuesInput, SheetFilterValuePage>(
  'sheet.filter.readValues',
);

/** Host-neutral data access required by filter commands and queries. */
export interface SheetFilterCommandSource {
  readonly target: PluginKey;
  readMatrix(): SheetFilterMatrix;
  readActiveDefinition(): SheetFilterDefinition | null;
  readPrivateDefinition(): SheetFilterDefinition | null;
  setPrivateDefinition(definition: SheetFilterDefinition | null): void;
  readShape(): readonly [number, number];
  readValue(row: number, column: number): unknown;
  readDisplayValue?(row: number, column: number, value: unknown): string;
  /** Evaluates a rule for a row, or against blank cells when row is null. */
  matchesPredicate?(row: number | null, column: number, predicate: SheetFilterPredicate): boolean;
  normalizeSearch(value: string): string;
  forEachStoredInRange(startRow: number, column: number, endRow: number, visit: (row: number) => void): void;
}

/** Registers the filter plugin's typed Sheet commands. */
export function registerSheetFilterCommands(commands: SheetCommandBus, source: SheetFilterCommandSource): void {
  commands.register(CreateSheetFilterCommand, (input) => {
    assertRange(input.range, source.readShape());
    const next: SheetFilterDefinition = {
      range: input.range,
      rules: [],
      firstRowIsHeader: input.firstRowIsHeader ?? true,
      privateView: false,
    };
    return updateFilter(CreateSheetFilterCommand.id, source, next);
  });
  commands.register(CreateSheetFilterViewCommand, (input) => {
    assertRange(input.range, source.readShape());
    return updatePrivateFilter(CreateSheetFilterViewCommand.id, source, {
      range: input.range,
      rules: [],
      firstRowIsHeader: input.firstRowIsHeader ?? true,
      privateView: true,
    });
  });
  commands.register(SetSheetColumnFilterCommand, (input) => {
    const current = source.readActiveDefinition();
    if (!current) throw new SearError('Create a filter range before setting a column filter.');
    if (!Number.isInteger(input.column) || input.column < current.range.start[1] || input.column > current.range.end[1])
      throw new SearError('Filter column is outside the filter range.');
    if (input.predicate) assertSheetFilterPredicate(input.predicate);
    const rules = current.rules.filter((rule) => rule.column !== input.column);
    if (input.predicate) rules.push({ column: input.column, predicate: input.predicate });
    const next = { ...current, rules };
    return source.readPrivateDefinition()
      ? updatePrivateFilter(SetSheetColumnFilterCommand.id, source, next)
      : updateFilter(SetSheetColumnFilterCommand.id, source, next);
  });
  commands.register(SetSheetColumnFiltersCommand, ({ updates }) => {
    const current = source.readActiveDefinition();
    if (!current) throw new SearError('Create a filter range before setting column filters.');
    if (updates.length === 0) throw new SearError('Column filter updates cannot be empty.');
    const columns = new Set<number>();
    for (const { column, predicate } of updates) {
      if (
        !Number.isInteger(column) ||
        column < current.range.start[1] ||
        column > current.range.end[1] ||
        columns.has(column)
      )
        throw new SearError('Filter column is outside the filter range or duplicated.');
      columns.add(column);
      if (predicate) assertSheetFilterPredicate(predicate);
    }
    const rules = current.rules.filter((rule) => !columns.has(rule.column));
    for (const { column, predicate } of updates) if (predicate) rules.push({ column, predicate });
    const next = { ...current, rules };
    return source.readPrivateDefinition()
      ? updatePrivateFilter(SetSheetColumnFiltersCommand.id, source, next)
      : updateFilter(SetSheetColumnFiltersCommand.id, source, next);
  });
  commands.register(SetSheetFilterHeaderCommand, ({ firstRowIsHeader }) => {
    const current = source.readActiveDefinition();
    if (!current) throw new SearError('Create a filter range before changing its header.');
    const next = { ...current, firstRowIsHeader };
    return source.readPrivateDefinition()
      ? updatePrivateFilter(SetSheetFilterHeaderCommand.id, source, next)
      : updateFilter(SetSheetFilterHeaderCommand.id, source, next);
  });
  commands.register(ClearSheetFilterCommand, () =>
    source.readPrivateDefinition()
      ? updatePrivateFilter(ClearSheetFilterCommand.id, source, null)
      : updateFilter(ClearSheetFilterCommand.id, source, null),
  );
  commands.register(ReapplySheetFilterCommand, () =>
    source.readPrivateDefinition()
      ? updatePrivateFilter(ReapplySheetFilterCommand.id, source, source.readPrivateDefinition())
      : updateFilter(ReapplySheetFilterCommand.id, source, source.readMatrix().getItem(0, 0)),
  );
}

/** Registers filter reads through the editor-local query registry. */
export function registerSheetFilterQueries(queries: SheetQueryRegistry, source: SheetFilterCommandSource): void {
  queries.register(ReadSheetFilterQuery, () => source.readActiveDefinition());
  queries.register(ReadSheetFilterValuesQuery, ({ column, search = '', limit = 200, includeBlank = false }) => {
    const current = source.readActiveDefinition();
    if (!current || column < current.range.start[1] || column > current.range.end[1])
      return { items: [], truncated: false };
    const max = Math.max(1, Math.min(1000, Number.isSafeInteger(limit) ? limit : 200));
    const needle = source.normalizeSearch(search);
    const first = current.range.start[0] + Number(current.firstRowIsHeader);
    const last = current.range.end[0];
    const otherRules = current.rules.filter((rule) => rule.column !== column);
    const matchesOtherRules = (row: number | null) =>
      otherRules.every((rule) => source.matchesPredicate!(row, rule.column, rule.predicate));
    let visibleRows = Math.max(0, last - first + 1);
    if (otherRules.length && source.matchesPredicate && first <= last) {
      const blankVisible = matchesOtherRules(null);
      visibleRows = blankVisible ? last - first + 1 : 0;
      const candidates = new Set<number>();
      for (const rule of otherRules)
        source.forEachStoredInRange(first, rule.column, last, (row) => candidates.add(row));
      for (const row of candidates) {
        if (matchesOtherRules(row) !== blankVisible) visibleRows += blankVisible ? -1 : 1;
      }
    }
    const counts = new Map<string, { value: string; count: number; isBoolean: boolean; label: string }>();
    let populated = 0;
    let truncated = false;
    if (first <= last)
      source.forEachStoredInRange(first, column, last, (row) => {
        if (otherRules.length && source.matchesPredicate && !matchesOtherRules(row)) return;
        populated += 1;
        const value = source.readValue(row, column);
        const key = sheetFilterValueKey(value);
        const label = source.readDisplayValue?.(row, column, value) ?? key;
        if (needle && !(includeBlank && key === '') && !source.normalizeSearch(label).includes(needle)) return;
        const matchKey = source.normalizeSearch(key);
        const existing = counts.get(matchKey);
        if (existing) {
          existing.count += 1;
          existing.isBoolean &&= typeof value === 'boolean';
        } else if (counts.size < max || (includeBlank && key === ''))
          counts.set(matchKey, { value: key, count: 1, isBoolean: typeof value === 'boolean', label });
        else truncated = true;
      });
    const blanks = visibleRows - populated;
    if (blanks > 0 && (!needle || includeBlank)) {
      if (counts.has('') || counts.size < max || includeBlank) {
        const existing = counts.get('');
        if (existing) existing.count += blanks;
        else counts.set('', { value: '', count: blanks, isBoolean: false, label: '' });
      } else truncated = true;
    }
    const entries = [...counts];
    if (includeBlank) entries.sort(([left], [right]) => Number(right === '') - Number(left === ''));
    return {
      items: entries.slice(0, max).map(([, { value, count, isBoolean, label }]) => ({
        value,
        count,
        ...(label !== value ? { label } : {}),
        ...(isBoolean ? { isBoolean: true as const } : {}),
      })),
      truncated: truncated || entries.length > max,
    };
  });
}

function updatePrivateFilter(id: string, source: SheetFilterCommandSource, next: SheetFilterDefinition | null) {
  return {
    id,
    execute: () => {
      const pipeline = new Pipeline(id).addPostCommit(id, () => source.setPrivateDefinition(next));
      pipeline.invalidate(id, source.target);
      return { pipeline };
    },
  };
}

function updateFilter(id: string, source: SheetFilterCommandSource, next: SheetFilterDefinition | null) {
  const previous = source.readMatrix().getItem(0, 0);
  return {
    id,
    execute: () => {
      const pipeline = new Pipeline(id);
      pipeline.addTransaction(
        id,
        createSheetTransaction(source.target, [createUpdateCellOTOperation([0, 0], next, previous)]),
      );
      pipeline.invalidate(id, source.target);
      return { pipeline };
    },
  };
}

function assertRange(range: SheetFilterDefinition['range'], shape: readonly [number, number]): void {
  const [top, left] = range.start;
  const [bottom, right] = range.end;
  if (
    ![top, left, bottom, right].every(Number.isSafeInteger) ||
    top < 0 ||
    left < 0 ||
    bottom < top ||
    right < left ||
    bottom >= shape[0] ||
    right >= shape[1]
  ) {
    throw new SearError('Filter range is outside sheet bounds.');
  }
}
