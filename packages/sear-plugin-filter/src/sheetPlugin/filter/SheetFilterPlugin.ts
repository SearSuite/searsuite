import {
  Plugin,
  PluginKey,
  SessionStateRegistry,
  SessionStateRestorePhase,
  defineSessionState,
  type PluginDocumentStateContribution,
} from '@searsuite/sear-assembly-plugin';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { type SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';
import { deserializeSparseMatrix, serializeSparseMatrix } from '@searsuite/sear-domain-matrix';
import {
  MatrixOT,
  MatrixOTActionName,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  isMatrixStructureOperation,
  isUpdateCellOperation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type Platform } from '@searsuite/sear-foundation-platform';
import {
  SheetDataFieldNamespace,
  SheetRowVisibilityFieldKey,
  type SheetRowVisibility,
} from '@searsuite/sear-domain-sheet';

import { SheetFilterMatrix, cloneSheetFilterDefinition } from '../../SheetFilterMatrix';
import {
  registerSheetFilterCommands,
  registerSheetFilterQueries,
  type SheetFilterCommandSource,
} from '../../SheetFilterCommands';
import { evaluateSheetFilter } from '../../evaluateSheetFilter';
import { type SheetFilterDefinition } from '../../SheetFilterTypes';
import { projectSheetFilterDefinition } from '../../projectSheetFilterDefinition';

/** Persisted state owned by the filter plugin. */
export interface SheetFilterPluginState {
  readonly filters: SheetFilterMatrix;
}
/** Host-neutral dependencies supplied by a Sheet composition root. */
export interface SheetFilterDependencies
  extends Omit<
    SheetFilterCommandSource,
    | 'target'
    | 'readMatrix'
    | 'readActiveDefinition'
    | 'readPrivateDefinition'
    | 'setPrivateDefinition'
    | 'normalizeSearch'
  > {
  readonly dataTarget?: PluginKey;
  readonly invalidateVisibilityAggregates?: () => void;
  readonly readColor: (row: number, column: number, property: 'fill' | 'textColor') => string | null;
  readonly parseDate?: (value: unknown) => number | null;
  readonly platform: Pick<Platform, 'toLowerCase'>;
  readonly displayedValueChanges?: Pick<SheetDisplayedValueChanges, 'subscribe'>;
}

const key = new PluginKey('SheetFilterPlugin');
/** Session-state contribution for a private filter view. */
export const SheetFilterViewSessionStateDefinition = defineSessionState<SheetFilterDefinition | null>(
  'sheet.filter.view',
);

/** Owns persisted filter rules and a derived, editor-local row visibility view. */
@Injectable()
export class SheetFilterPlugin extends Plugin<SheetFilterPluginState> implements SheetRowVisibility {
  readonly #dependencies: SheetFilterDependencies;

  public static readonly symbol = Symbol.for('SheetFilterPlugin');
  public static readonly pluginKey = key;
  public static readonly documentState: PluginDocumentStateContribution<
    SheetFilterPluginState,
    SheetFilterPluginState
  > = {
    key: 'sheet.filters',
    capture: (state) => ({ filters: state.filters.clone() }),
    codec: {
      key: 'sheet.filters',
      serialize: (state) => (state.filters ? serializeSparseMatrix(state.filters) : undefined),
      deserialize: (payload, path) => ({
        filters: deserializeSparseMatrix<SheetFilterDefinition | null, SheetFilterMatrix>(
          payload,
          SheetFilterMatrix,
          path,
        ),
      }),
    },
  };
  public override readonly transactionOT = {
    ownerId: 'sheet.filter',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };
  public override readonly documentState = SheetFilterPlugin.documentState;
  public override interestedIn = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];
  #revision = 0;
  readonly #rowResults = new Map<number, boolean>();
  #currentDefinition: SheetFilterDefinition | null;
  #privateDefinition: SheetFilterDefinition | null = null;
  #candidateRows: Set<number> | null = null;
  #blankFiltered = false;
  #commandBus: SheetCommandBus | null = null;
  readonly #visibilityView: SheetRowVisibility;
  readonly #disposeValueChanges: (() => void) | undefined;

  public constructor(state: SheetFilterPluginState, dependencies: SheetFilterDependencies) {
    super({ key, state });
    this.#dependencies = dependencies;
    const owner = this;
    this.#visibilityView = Object.freeze({
      get version() {
        return owner.version;
      },
      get active() {
        return owner.active;
      },
      isRowFiltered(row: number) {
        return owner.isRowFiltered(row);
      },
    });
    this.#currentDefinition = state.filters.getItem(0, 0);
    this.#disposeValueChanges = dependencies.displayedValueChanges?.subscribe(() => this.#invalidate());
  }

  public isHeaderCell(row: number, column: number): boolean {
    const definition = this.#privateDefinition ?? this.#currentDefinition;
    return (
      !!definition &&
      row === definition.range.start[0] &&
      column >= definition.range.start[1] &&
      column <= definition.range.end[1]
    );
  }

  public override onTransactionCommitted(transaction: Transaction): void {
    if (this.#commandBus && !this.#commandBus.isExecuting())
      throw new SearError('Sheet filter changes must run through editor.commands.run(...).');
    const structure = transaction.operations.filter(isMatrixStructureOperation);
    if (transaction.pluginKey === key) {
      this.#privateDefinition = null;
      this.#invalidate(this.getState().filters.getItem(0, 0));
      this.#dependencies.invalidateVisibilityAggregates?.();
      return;
    }
    if (structure.length) this.#invalidate(this.getState().filters.getItem(0, 0));
    else if (transaction.operations.some(isUpdateCellOperation)) this.#invalidate();
    if (this.#privateDefinition && structure.length) {
      let projected: SheetFilterDefinition | null = this.#privateDefinition;
      for (const operation of structure)
        projected = projected ? projectSheetFilterDefinition(projected, operation) : null;
      this.#setPrivateDefinition(projected);
    }
  }

  public get version(): number {
    return this.#revision;
  }
  public get active(): boolean {
    return ((this.#privateDefinition ?? this.#currentDefinition)?.rules.length ?? 0) > 0;
  }

  public isRowFiltered(row: number): boolean {
    const definition = this.#privateDefinition ?? this.#currentDefinition;
    if (
      !definition ||
      definition.rules.length === 0 ||
      row < definition.range.start[0] ||
      row > definition.range.end[0] ||
      (definition.firstRowIsHeader && row === definition.range.start[0])
    )
      return false;
    this.#prepareSparseCandidates(definition);
    if (this.#candidateRows && !this.#candidateRows.has(row)) return this.#blankFiltered;
    const cached = this.#rowResults.get(row);
    if (cached !== undefined) return cached;
    const filtered = definition.rules.some(
      ({ column, predicate }) =>
        !evaluateSheetFilter(
          predicate,
          this.#dependencies.readValue(row, column),
          (property) => this.#dependencies.readColor(row, column, property),
          this.#dependencies.platform,
          this.#dependencies.parseDate,
        ),
    );
    if (this.#rowResults.size >= 4096) this.#rowResults.clear();
    this.#rowResults.set(row, filtered);
    return filtered;
  }

  public registerCommands(commands: SheetCommandBus): void {
    if (this.#commandBus && this.#commandBus !== commands) {
      throw new SearError('Sheet filter commands are already bound to an editor.');
    }
    this.#commandBus = commands;
    registerSheetFilterCommands(commands, this.#commandSource());
  }

  public registerQueries(queries: SheetQueryRegistry): void {
    registerSheetFilterQueries(queries, this.#commandSource());
  }

  public registerSessionState(registry: SessionStateRegistry): void {
    this.registerOwnedSessionState(registry, () => {
      registry.register(SheetFilterViewSessionStateDefinition, {
        restorePhase: SessionStateRestorePhase.BeforeInitialize,
        capture: () => (this.#privateDefinition ? cloneSheetFilterDefinition(this.#privateDefinition) : undefined),
        restore: (definition) => {
          SessionStateRegistry.prototype.assertRestorationOpen.call(registry);
          this.#setPrivateDefinition(definition ?? null);
        },
      });
    });
  }

  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetRowVisibilityFieldKey,
            select: (): SheetRowVisibility => this.#visibilityView,
          },
        ],
      },
    };
  }

  public apply(state: SheetFilterPluginState, transaction: Transaction): SheetFilterPluginState | null {
    let changed = false;
    for (const operation of transaction.operations as Operation[]) {
      if (isUpdateCellOperation<SheetFilterDefinition | null>(operation)) {
        if (transaction.pluginKey === key) {
          MatrixOT.apply(state.filters, [operation]);
          changed = true;
        }
      } else if (isMatrixStructureOperation(operation)) {
        const definition = state.filters.getItem(0, 0);
        if (!definition) continue;
        const projected = projectSheetFilterDefinition(definition, operation);
        if (projected) state.filters.addItem(0, 0, projected);
        else state.filters.removeItem(0, 0);
        changed = true;
      }
    }
    return changed ? state : null;
  }

  public dispose(): void {
    this.assertRuntimeWriteAllowed();
    this.#disposeValueChanges?.();
    this.#rowResults.clear();
  }

  #invalidate(definition?: SheetFilterDefinition | null): void {
    if (definition !== undefined) this.#currentDefinition = definition;
    this.#revision += 1;
    this.#rowResults.clear();
    this.#candidateRows = null;
  }

  #setPrivateDefinition(definition: SheetFilterDefinition | null): void {
    this.#privateDefinition = definition ? cloneSheetFilterDefinition(definition) : null;
    this.#invalidate();
    this.#dependencies.invalidateVisibilityAggregates?.();
  }

  #prepareSparseCandidates(definition: SheetFilterDefinition): void {
    if (this.#candidateRows || definition.rules.some(({ predicate }) => predicate.kind === 'color')) return;
    const candidates = new Set<number>();
    const first = definition.range.start[0] + Number(definition.firstRowIsHeader);
    for (const { column } of definition.rules) {
      this.#dependencies.forEachStoredInRange(first, column, definition.range.end[0], (row) => candidates.add(row));
    }
    this.#blankFiltered = definition.rules.some(
      ({ predicate }) =>
        !evaluateSheetFilter(predicate, null, () => null, this.#dependencies.platform, this.#dependencies.parseDate),
    );
    this.#candidateRows = candidates;
  }

  #commandSource(): SheetFilterCommandSource {
    return {
      target: key,
      readMatrix: () => this.getState().filters,
      readActiveDefinition: () => {
        const definition = this.#privateDefinition ?? this.getState().filters.getItem(0, 0);
        return definition ? cloneSheetFilterDefinition(definition) : null;
      },
      readPrivateDefinition: () =>
        this.#privateDefinition ? cloneSheetFilterDefinition(this.#privateDefinition) : null,
      setPrivateDefinition: (definition) => this.#setPrivateDefinition(definition),
      readShape: this.#dependencies.readShape,
      readValue: this.#dependencies.readValue,
      ...(this.#dependencies.readDisplayValue ? { readDisplayValue: this.#dependencies.readDisplayValue } : {}),
      matchesPredicate: (row, column, predicate) =>
        evaluateSheetFilter(
          predicate,
          row === null ? null : this.#dependencies.readValue(row, column),
          (property) => (row === null ? null : this.#dependencies.readColor(row, column, property)),
          this.#dependencies.platform,
          this.#dependencies.parseDate,
        ),
      normalizeSearch: (value) => this.#dependencies.platform.toLowerCase(value),
      forEachStoredInRange: this.#dependencies.forEachStoredInRange,
    };
  }
}
