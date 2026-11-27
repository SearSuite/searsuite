import { resolveCellHighlightStyle } from '../../resolveCellHighlightStyle';
import { type SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import { type CellHighlightMatch } from '../../CellHighlightMatch';
import {
  SheetRangeMoveRegistry,
  Plugin,
  PluginKey,
  createSheetRangeRuleMoveContribution,
  type SheetFormatTransferRegistry,
  type PluginDocumentStateContribution,
} from '@searsuite/sear-assembly-plugin';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { deserializeSparseMatrix, serializeSparseMatrix } from '@searsuite/sear-domain-matrix';
import { type SheetDisplayedValueChanges, type SheetDisplayedValueCoordinate } from '@searsuite/sear-domain-cell-types';
import {
  MatrixOT,
  MatrixOTActionName,
  MatrixCellUpdateIntent,
  RectOT,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  createDeleteColOTOperation,
  createDeleteRowOTOperation,
  createInsertColOTOperation,
  createInsertRowOTOperation,
  createMoveColOTOperation,
  createMoveRowOTOperation,
  createUpdateCellOTOperation,
  isMatrixStructureOperation,
  isUpdateCellOperation,
  type MatrixOTOperation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { Rect } from '@searsuite/sear-foundation-rect';

import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { CellHighlightMatrix, type PositionedCellHighlightRule } from '../../CellHighlightMatrix';
import { CellHighlightKind, isCellHighlightRangeStatisticKind, type CellHighlightRule } from '../../CellHighlightRule';
import {
  computeCellHighlightRangeThreshold,
  type CellHighlightNumericRangeReader,
} from '../../CellHighlightRangeStatistics';
import {
  countCellHighlightOccurrences,
  evaluateCellHighlight,
  cellHighlightText,
  hasCellHighlightWildcard,
  matchesCellHighlightWildcard,
  type CellHighlightValueReader,
  type CellHighlightValueRangeReader,
} from '../../evaluateCellHighlight';
import { createCellHighlightFormatTransfer } from './CellHighlightRuleTransfer';
import { registerCellHighlightCommands, registerCellHighlightQueries } from './SheetCellHighlightCommands';
import { SheetCellHighlightFieldKey } from './SheetCellHighlightDataField';

export interface SheetCellHighlightPluginState {
  readonly cellHighlights: CellHighlightMatrix;
}
export interface CellHighlightDependencies {
  readonly readValue: CellHighlightValueReader;
  readonly forEachValueInRange: CellHighlightValueRangeReader;
  readonly readNumericValue: (row: number, column: number) => number | null;
  readonly forEachNumericValueInRange: CellHighlightNumericRangeReader;
  readonly createId: () => string;
  readonly nextPriority?: () => number;
  readonly platform: Pick<Platform, 'toLowerCase'>;
  readonly displayedValueChanges?: Pick<SheetDisplayedValueChanges, 'subscribe'>;
}

const pluginKey = new PluginKey('SheetCellHighlightPlugin');

@Injectable()
export class SheetCellHighlightPlugin extends Plugin<SheetCellHighlightPluginState> {
  public registerCellStyles(registry: SheetCellStyleRegistry): void {
    registry.registerConditional({
      id: 'sheet.cellHighlight',
      properties: ['fill', 'textColor', 'stroke'],
      read: (row, column) =>
        this.readMatches(row, column).map((match) => ({
          id: match.id,
          priority: match.priority,
          properties: resolveCellHighlightStyle(match.style),
        })),
    });
  }

  readonly #dependencies: CellHighlightDependencies;

  readonly #occurrenceCounts = new Map<
    string,
    {
      counts: Map<string, number>;
      wildcardPatterns: string[];
      resolved: Map<string, number>;
    }
  >();
  readonly #rangeThresholds = new Map<string, number | null>();
  readonly #disposeValueChanges: (() => void) | undefined;
  public static readonly symbol = Symbol.for('SheetCellHighlightPlugin');
  public static readonly pluginKey = pluginKey;
  public static readonly documentState: PluginDocumentStateContribution<
    SheetCellHighlightPluginState,
    SheetCellHighlightPluginState
  > = {
    key: 'sheet.cellHighlights',
    capture: (state) => ({ cellHighlights: state.cellHighlights.clone() }),
    codec: {
      key: 'sheet.cellHighlights',
      serialize: (state) => serializeSparseMatrix(state.cellHighlights),
      deserialize: (payload, path) => ({
        cellHighlights: deserializeSparseMatrix<CellHighlightRule[] | null, CellHighlightMatrix>(
          payload,
          CellHighlightMatrix,
          path,
        ),
      }),
    },
  };
  public override readonly transactionOT = {
    ownerId: 'sheet.cellHighlight',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };
  public override readonly documentState = SheetCellHighlightPlugin.documentState;
  public override interestedIn = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  public constructor(state: SheetCellHighlightPluginState, dependencies: CellHighlightDependencies) {
    super({ key: pluginKey, state });
    this.#dependencies = dependencies;
    this.#disposeValueChanges = dependencies.displayedValueChanges?.subscribe((cells) =>
      this.invalidateRangeStatistics(cells),
    );
  }

  public registerCommands(commands: SheetCommandBus): void {
    registerCellHighlightCommands(commands, {
      target: this.key,
      readMatrix: () => this.getState().cellHighlights,
      createId: this.#dependencies.createId,
      nextPriority: this.#dependencies.nextPriority,
    });
  }

  public registerQueries(queries: SheetQueryRegistry): void {
    registerCellHighlightQueries(queries, () => this.getState().cellHighlights);
  }

  public getHighestPriority(): number {
    return this.getState()
      .cellHighlights.getRules()
      .reduce((highest, { rule }) => Math.max(highest, rule.priority), 0);
  }

  public readMatches(rowIndex: number, columnIndex: number): readonly CellHighlightMatch[] {
    const matrix = this.getState().cellHighlights;
    const entries = matrix.findRules(rowIndex, columnIndex);
    if (!entries.length) return [];
    const value = this.#dependencies.readValue(rowIndex, columnIndex);
    let numericValue: number | null | undefined;
    let numericRead = false;
    const matched: CellHighlightMatch[] = [];
    for (const { row, column, rule } of entries) {
      const statistic = isCellHighlightRangeStatisticKind(rule.condition.kind);
      if (statistic && !numericRead) {
        numericValue = this.#dependencies.readNumericValue(rowIndex, columnIndex);
        numericRead = true;
      }
      if (statistic && numericValue === null) continue;
      const occurrences =
        rule.condition.kind === CellHighlightKind.Duplicate || rule.condition.kind === CellHighlightKind.Unique
          ? this.#countOccurrences(row, column, rule, value)
          : 0;
      const threshold = statistic ? this.#rangeThreshold(row, column, rule) : null;
      if (
        evaluateCellHighlight(
          rule.condition,
          statistic ? numericValue : value,
          this.#dependencies.platform,
          occurrences,
          threshold,
        )
      ) {
        matched.push({ id: rule.id, priority: rule.priority, style: rule.style });
      }
    }
    return matched;
  }

  #countOccurrences(row: number, column: number, rule: CellHighlightRule, value: unknown): number {
    const text = cellHighlightText(value);
    if (text === '') return 0;
    let cache = this.#occurrenceCounts.get(rule.id);
    if (!cache) {
      const counts = countCellHighlightOccurrences(
        row,
        column,
        rule.endRow,
        rule.endColumn,
        this.#dependencies.forEachValueInRange,
      );
      cache = { counts, wildcardPatterns: [...counts.keys()].filter(hasCellHighlightWildcard), resolved: new Map() };
      this.#occurrenceCounts.set(rule.id, cache);
    }
    if (!cache.wildcardPatterns.length) return cache.counts.get(text) ?? 0;
    const cached = cache.resolved.get(text);
    if (cached !== undefined) return cached;
    let occurrences = cache.counts.get(text) ?? 0;
    const candidates = hasCellHighlightWildcard(text) ? cache.counts.keys() : cache.wildcardPatterns;
    for (const candidate of candidates) {
      if (candidate === text) continue;
      if (
        matchesCellHighlightWildcard(candidate, text, this.#dependencies.platform) ||
        matchesCellHighlightWildcard(text, candidate, this.#dependencies.platform)
      ) {
        occurrences += cache.counts.get(candidate) ?? 0;
      }
    }
    cache.resolved.set(text, occurrences);
    return occurrences;
  }

  #rangeThreshold(row: number, column: number, rule: CellHighlightRule): number | null {
    if (!this.#rangeThresholds.has(rule.id)) {
      this.#rangeThresholds.set(
        rule.id,
        computeCellHighlightRangeThreshold(
          rule.condition,
          row,
          column,
          rule.endRow,
          rule.endColumn,
          this.#dependencies.forEachNumericValueInRange,
        ),
      );
    }
    return this.#rangeThresholds.get(rule.id) ?? null;
  }

  /** Invalidates derived range statistics after displayed values change. */
  public invalidateRangeStatistics(cells?: readonly SheetDisplayedValueCoordinate[]): void {
    if (!cells) {
      this.#occurrenceCounts.clear();
      this.#rangeThresholds.clear();
      return;
    }
    const matrix = this.getState().cellHighlights;
    for (const { row, column } of cells) {
      for (const { rule } of matrix.findRules(row, column)) {
        this.#occurrenceCounts.delete(rule.id);
        this.#rangeThresholds.delete(rule.id);
      }
    }
  }

  public dispose(): void {
    this.assertRuntimeWriteAllowed();
    this.#disposeValueChanges?.();
    this.#occurrenceCounts.clear();
    this.#rangeThresholds.clear();
  }

  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetCellHighlightFieldKey,
            select: (state: SheetCellHighlightPluginState) => state.cellHighlights,
          },
        ],
      },
    };
  }

  public registerFormatTransfers(registry: SheetFormatTransferRegistry): void {
    registry.register(
      createCellHighlightFormatTransfer(
        this.key,
        () => this.getState().cellHighlights,
        this.#dependencies.createId,
        this.#dependencies.nextPriority,
      ),
    );
  }

  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register(
      createSheetRangeRuleMoveContribution<PositionedCellHighlightRule>({
        id: 'sheet.cellHighlight.rangeMove',
        readRules: () =>
          this.getState()
            .cellHighlights.getRules()
            .map((entry) => ({
              range: { start: [entry.row, entry.column], end: [entry.rule.endRow, entry.rule.endColumn] },
              rule: entry,
            })),
        plan: (_context, affected, fragments) => {
          const matrix = this.getState().cellHighlights;
          const updates = new Map<
            string,
            {
              row: number;
              column: number;
              previous: CellHighlightRule[] | null;
              next: CellHighlightRule[];
            }
          >();
          const getUpdate = (row: number, column: number) => {
            const key = `${row}:${column}`;
            let update = updates.get(key);
            if (!update) {
              const previous = matrix.getItem(row, column);
              update = { row, column, previous, next: [...(previous ?? [])] };
              updates.set(key, update);
            }
            return update;
          };
          for (const {
            rule: { row, column, rule },
          } of affected) {
            const update = getUpdate(row, column);
            update.next = update.next.filter((entry) => entry.id !== rule.id);
          }
          const preservedIds = new Set<string>();
          for (const { original, range } of fragments) {
            const originalRule = original.rule.rule;
            const id = preservedIds.has(originalRule.id) ? this.#dependencies.createId() : originalRule.id;
            preservedIds.add(originalRule.id);
            getUpdate(range.start[0], range.start[1]).next.push({
              ...originalRule,
              id,
              endRow: range.end[0],
              endColumn: range.end[1],
            });
          }
          return [
            {
              target: this.key,
              operations: [...updates.values()].map(({ row, column, next, previous }) =>
                createUpdateCellOTOperation(
                  [row, column],
                  next.length ? next : null,
                  previous,
                  MatrixCellUpdateIntent.Relocation,
                ),
              ),
            },
          ];
        },
      }),
    );
  }

  public apply(state: SheetCellHighlightPluginState, transaction: Transaction): SheetCellHighlightPluginState | null {
    let changed = false;
    for (const operation of transaction.operations as Operation[]) {
      if (isUpdateCellOperation<CellHighlightRule[] | null>(operation)) {
        this.invalidateRangeStatistics();
        if (transaction.pluginKey !== pluginKey) continue;
        MatrixOT.apply(state.cellHighlights, [operation]);
        changed = true;
        continue;
      }
      if (!isMatrixStructureOperation(operation)) continue;
      this.invalidateRangeStatistics();
      const entries = state.cellHighlights.getRules();
      MatrixOT.apply(state.cellHighlights, [projectStructureOperation(state.cellHighlights, operation)]);
      const moved: PositionedCellHighlightRule[] = [];
      for (const entry of entries) {
        const rect = new Rect([
          [entry.row, entry.column],
          [entry.rule.endRow, entry.rule.endColumn],
        ]);
        RectOT.apply(rect, [operation]);
        const start = rect.getPoint(0);
        const end = rect.getPoint(1);
        if (
          start[0] <= end[0] &&
          start[1] <= end[1] &&
          start[0] >= 0 &&
          start[1] >= 0 &&
          end[0] < state.cellHighlights.shape[0] &&
          end[1] < state.cellHighlights.shape[1]
        ) {
          moved.push({ row: start[0], column: start[1], rule: { ...entry.rule, endRow: end[0], endColumn: end[1] } });
        }
      }
      state.cellHighlights.replaceRules(moved);
      changed = true;
    }
    return changed ? state : null;
  }
}

function projectStructureOperation(
  matrix: CellHighlightMatrix,
  operation: Operation,
): MatrixOTOperation<CellHighlightRule[] | null> {
  if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0)
    return createInsertRowOTOperation(operation.p, Array(matrix.shape[1]).fill(null));
  if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0)
    return createDeleteRowOTOperation(
      operation.p,
      Array.from({ length: matrix.shape[1] }, (_, column) => matrix.getItem(operation.p[0], column)),
    );
  if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0)
    return createMoveRowOTOperation(operation.p, operation.rm);
  if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0)
    return createInsertColOTOperation(operation.p, Array(matrix.shape[0]).fill(null));
  if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0)
    return createDeleteColOTOperation(
      operation.p,
      Array.from({ length: matrix.shape[0] }, (_, row) => matrix.getItem(row, operation.p[0])),
    );
  if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0)
    return createMoveColOTOperation(operation.p, operation.cm);
  throw new SearError('Unsupported cell highlight structure operation.');
}
