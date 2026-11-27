import { type NumericValidationControl } from '../../NumericValidationControl';
import {
  Plugin,
  PluginKey,
  SheetClipboardTransferRegistry,
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  createSheetRangeRuleMoveContribution,
  type PluginDocumentStateContribution,
  type RuntimeCapabilityRegistry,
} from '@searsuite/sear-assembly-plugin';

import { SheetCommandBus, SheetQueryRegistry, TransactionPipelineCommand } from '@searsuite/sear-assembly-commands';
import {
  CellCommitStrategyRegistry,
  SheetCellInputValidationRegistry,
  type SheetCellInputValidationResult,
} from '@searsuite/sear-domain-cell-types';
import { deserializeSparseMatrix, serializeSparseMatrix } from '@searsuite/sear-domain-matrix';
import {
  MatrixOT,
  MatrixOTActionName,
  MatrixCellUpdateIntent,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  RectOT,
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
import { Rect } from '@searsuite/sear-foundation-rect';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';

import { formatFormulaValue } from '@searsuite/sear-domain-cell-types';

import { DataValidationMatrix, type PositionedDataValidationRule } from '../../DataValidationMatrix';
import { readNumericValidationControl } from '../../NumericValidationControl';

import { createDataValidationReorderOperations } from '../../createDataValidationReorderOperations';
import {
  captureDataValidationRules,
  createDataValidationClipboardOperations,
} from '../../createDataValidationClipboardOperations';
import { IdentityCardCellCommitStrategy } from '../../IdentityCardCellCommitStrategy';
import { type DataValidationIssue } from '../../DataValidationIssue';
import {
  DataValidationEvaluatorRegistry,
  DataValidationEvaluatorRegistryCapability,
} from '../../DataValidationEvaluatorRegistry';
import {
  registerDataValidationEvaluatorCommands,
  UnregisterDataValidationEvaluatorCommand,
} from '../../DataValidationEvaluatorCommands';
import { DataValidationWarningObservation, type DataValidationWarning } from '../../DataValidationObservations';
import {
  DataValidationInputPolicy,
  type DataValidationCondition,
  type DataValidationRule,
} from '../../DataValidationRule';
import { evaluateDataValidation, type DataValidationEvaluationContext } from '../../evaluateDataValidation';
import {
  registerDataValidationCommands,
  registerDataValidationQueries,
  SetNumericValidationControlValueCommand,
} from './SheetDataValidationCommands';
import { SheetDataValidationFieldKey } from './SheetDataValidationDataField';

export interface SheetDataValidationPluginState {
  readonly dataValidations: DataValidationMatrix;
}
export interface SheetDataValidationDependencies {
  readonly createId: () => string;
  readonly currentDateTime?: () => number;
  readonly inputValidation: SheetCellInputValidationRegistry;
  readonly readSourceValues?: DataValidationEvaluationContext['readSourceValues'];
  readonly readValue?: (row: number, column: number) => unknown;
  readonly evaluateFormulaInput?: (formula: string, row: number, column: number) => unknown;
  readonly createNumericControlValueTransaction?: (row: number, column: number, value: number) => Transaction;
  readonly evaluators: DataValidationEvaluatorRegistry;
}

const pluginKey = new PluginKey('SheetDataValidationPlugin');

function toValidationText(value: unknown): string {
  return value === null || value === undefined
    ? ''
    : typeof value === 'object'
    ? formatFormulaValue(value)
    : String(value);
}

@Injectable()
export class SheetDataValidationPlugin extends Plugin<SheetDataValidationPluginState> {
  readonly #dependencies: SheetDataValidationDependencies;

  public static readonly symbol = Symbol.for('SheetDataValidationPlugin');
  public static readonly pluginKey = pluginKey;
  public static readonly documentState: PluginDocumentStateContribution<
    SheetDataValidationPluginState,
    SheetDataValidationPluginState
  > = {
    key: 'sheet.dataValidations',
    capture: (state) => ({ dataValidations: state.dataValidations.clone() }),
    codec: {
      key: 'sheet.dataValidations',
      serialize: (state) => serializeSparseMatrix(state.dataValidations),
      deserialize: (payload, path) => ({
        dataValidations: deserializeSparseMatrix<DataValidationRule[] | null, DataValidationMatrix>(
          payload,
          DataValidationMatrix,
          path,
        ),
      }),
    },
  };
  public readonly warnOnDuplicateDepth = false;
  public override readonly documentState = SheetDataValidationPlugin.documentState;
  public override readonly transactionOT = {
    ownerId: 'sheet.dataValidation',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };
  public override interestedIn = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];
  readonly #disposeValidation: () => void;
  readonly #warningListeners = new Set<(warning: DataValidationWarning) => void>();
  #commands: SheetCommandBus | null = null;

  public constructor(state: SheetDataValidationPluginState, dependencies: SheetDataValidationDependencies) {
    super({ key: pluginKey, state });
    this.#dependencies = dependencies;
    Object.defineProperty(this, 'dependencies', {
      value: Object.freeze({ ...dependencies }),
      writable: false,
      configurable: false,
    });
    this.#disposeValidation = dependencies.inputValidation.register('sheet.dataValidation', (row, column, text) =>
      this.validate(row, column, text),
    );
  }

  public registerCommands(commands: SheetCommandBus): void {
    this.#commands = commands;
    registerDataValidationCommands(
      commands,
      this.key,
      () => this.getState().dataValidations,
      this.#dependencies.createId,
      (condition, text, row, column) => this.#evaluate(condition, text, row, column),
    );
    registerDataValidationEvaluatorCommands(commands, this.#dependencies.evaluators);
    if (this.#dependencies.createNumericControlValueTransaction) {
      commands.register(SetNumericValidationControlValueCommand, ({ row, column, value }) => {
        const control = readNumericValidationControl(
          this.getState().dataValidations,
          row,
          column,
          this.#dependencies.readValue?.(row, column),
        );
        if (
          !control ||
          this.#evaluate({ kind: control.kind }, String(value), row, column) !== true ||
          this.validate(row, column, String(value)).reject
        )
          throw new SearError('Cannot set this data validation control to the requested value.');
        return new TransactionPipelineCommand(
          SetNumericValidationControlValueCommand.id,
          this.#dependencies.createNumericControlValueTransaction!(row, column, value),
        );
      });
    }
  }

  public sealRuntimeWrites(): void {
    if (!this.#commands) throw new SearError('Data validation commands must be registered before sealing evaluators.');
    const commands = this.#commands;
    DataValidationEvaluatorRegistry.prototype.enforceCommandBoundary.call(
      this.#dependencies.evaluators,
      commands.isExecuting.bind(commands),
      (id) => commands.run(UnregisterDataValidationEvaluatorCommand, id),
    );
  }

  public registerQueries(queries: SheetQueryRegistry): void {
    registerDataValidationQueries(
      queries,
      () => this.getState().dataValidations,
      (row, column) => this.readIssue(row, column),
      (kind) => this.#dependencies.evaluators.canEvaluate(kind),
    );
  }

  public registerCommitStrategies(registry: CellCommitStrategyRegistry): void {
    registry.register(new IdentityCardCellCommitStrategy(() => this.getState().dataValidations));
  }

  public registerCapabilities(registry: RuntimeCapabilityRegistry): void {
    registry.register(DataValidationEvaluatorRegistryCapability, this.#dependencies.evaluators);
  }

  public registerObservations(registry: ObservationRegistry): void {
    registry.register(DataValidationWarningObservation, {
      subscribe: (listener) => {
        this.#warningListeners.add(listener);
        return () => {
          this.#warningListeners.delete(listener);
        };
      },
    });
  }

  public onTransactionCommitted(transaction: Transaction): void {
    if (transaction.pluginKey === pluginKey) {
      return;
    }
    if (
      transaction.pluginKey !== SheetDataPlugin.pluginKey ||
      !this.#warningListeners.size ||
      !this.#dependencies.readValue
    )
      return;
    for (const operation of transaction.operations as Operation[]) {
      if (!isUpdateCellOperation(operation)) continue;
      const [row, column] = operation.p;
      if (row === undefined || column === undefined) continue;
      const value = this.#dependencies.readValue(row, column);
      const result = this.validate(row, column, toValidationText(value));
      if (result.valid || !result.ruleId || !result.message) continue;
      const warning = { row, column, ruleId: result.ruleId, message: result.message };
      const notify = (): void => {
        for (const listener of this.#warningListeners) listener(warning);
      };
      if (this.#commands) this.#commands.runWithoutMutationAuthority(notify);
      else notify();
    }
  }

  public validate(row: number, column: number, text: string): SheetCellInputValidationResult {
    const entries = this.getState().dataValidations.findRules(row, column);
    if (entries.length === 0) return { valid: true, reject: false };
    const candidate =
      text.startsWith('=') && this.#dependencies.evaluateFormulaInput
        ? this.#dependencies.evaluateFormulaInput(text, row, column)
        : text;
    const candidateText = toValidationText(candidate);
    let warning: SheetCellInputValidationResult | null = null;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const rule = entries[index]!.rule;
      const result = this.#evaluate(rule.condition, candidateText, row, column);
      if (result === true) continue;
      const issue = {
        valid: false,
        reject: rule.inputPolicy === DataValidationInputPolicy.Reject,
        ruleId: rule.id,
        message:
          result === null
            ? 'The host has no validator for this rule type. Configure one or use another rule type.'
            : rule.errorMessage ?? 'Cell value does not satisfy the validation rule.',
      };
      if (issue.reject) return issue;
      warning ??= issue;
    }
    return warning ?? { valid: true, reject: false };
  }

  /** Returns a definite failure for the cell's current value, including values predating the rule. */
  public readNumericControl(row: number, column: number): NumericValidationControl | null {
    return this.#dependencies.readValue
      ? readNumericValidationControl(
          this.getState().dataValidations,
          row,
          column,
          this.#dependencies.readValue(row, column),
        )
      : null;
  }

  public readIssue(row: number, column: number): DataValidationIssue | null {
    if (!this.#dependencies.readValue) return null;
    const value = this.#dependencies.readValue(row, column);
    const text = toValidationText(value);
    const entries = this.getState().dataValidations.findRules(row, column);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const rule = entries[index]!.rule;
      if (this.#evaluate(rule.condition, text, row, column) === false) {
        return {
          row,
          column,
          ruleId: rule.id,
          message: rule.errorMessage ?? 'Cell value does not satisfy the validation rule.',
        };
      }
    }
    return null;
  }

  #evaluate(condition: DataValidationCondition, text: string, row: number, column: number): boolean | null {
    return evaluateDataValidation(condition, text, {
      row,
      column,
      ...(this.#dependencies.currentDateTime ? { currentDateTime: this.#dependencies.currentDateTime() } : {}),
      ...(this.#dependencies.readSourceValues ? { readSourceValues: this.#dependencies.readSourceValues } : {}),
      evaluateExternal: (condition, value, candidateRow, candidateColumn) =>
        this.#dependencies.evaluators.evaluate(condition, value, candidateRow, candidateColumn),
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
            fieldKey: SheetDataValidationFieldKey,
            select: (state: SheetDataValidationPluginState) => state.dataValidations,
          },
        ],
      },
    };
  }

  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register(
      createSheetRangeRuleMoveContribution<PositionedDataValidationRule>({
        id: 'sheet.dataValidation.rangeMove',
        readRules: () =>
          this.getState()
            .dataValidations.getRules()
            .map((entry) => ({
              range: { start: [entry.row, entry.column], end: [entry.rule.endRow, entry.rule.endColumn] },
              rule: entry,
            })),
        plan: (_context, affected, fragments) => {
          const matrix = this.getState().dataValidations;
          const changes = new Map<
            string,
            { row: number; column: number; previous: DataValidationRule[] | null; next: DataValidationRule[] }
          >();
          const changeAt = (row: number, column: number) => {
            const key = `${row}:${column}`;
            let change = changes.get(key);
            if (!change) {
              const previous = matrix.getItem(row, column);
              change = { row, column, previous, next: [...(previous ?? [])] };
              changes.set(key, change);
            }
            return change;
          };
          for (const {
            rule: { row, column, rule },
          } of affected) {
            const change = changeAt(row, column);
            change.next = change.next.filter((entry) => entry.id !== rule.id);
          }
          const preservedIds = new Set<string>();
          for (const { original, range } of fragments) {
            const originalRule = original.rule.rule;
            const id = preservedIds.has(originalRule.id) ? this.#dependencies.createId() : originalRule.id;
            preservedIds.add(originalRule.id);
            changeAt(range.start[0], range.start[1]).next.push({
              ...originalRule,
              id,
              endRow: range.end[0],
              endColumn: range.end[1],
            });
          }
          return [
            {
              target: this.key,
              operations: [...changes.values()].map(({ row, column, previous, next }) =>
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

  public registerClipboardTransfers(registry: SheetClipboardTransferRegistry): void {
    registry.register({
      id: 'sheet.dataValidation.clipboard',
      capture: (source) => captureDataValidationRules(this.getState().dataValidations, source),
      planCaptured: (instances) => [
        {
          target: this.key,
          operations: createDataValidationClipboardOperations(
            this.getState().dataValidations,
            instances,
            this.#dependencies.createId,
          ),
        },
      ],
      clear: (range) => [
        {
          target: this.key,
          operations: createDataValidationClipboardOperations(
            this.getState().dataValidations,
            [{ destination: range, portable: [] }],
            this.#dependencies.createId,
          ),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.dataValidation.rangeReorder',
      plan: (context) => [
        {
          target: this.key,
          operations: createDataValidationReorderOperations(
            this.getState().dataValidations,
            context,
            this.#dependencies.createId,
          ),
        },
      ],
    });
  }

  public apply(state: SheetDataValidationPluginState, transaction: Transaction): SheetDataValidationPluginState | null {
    let changed = false;
    for (const operation of transaction.operations as Operation[]) {
      if (isUpdateCellOperation<DataValidationRule[] | null>(operation)) {
        if (transaction.pluginKey !== pluginKey) continue;
        MatrixOT.apply(state.dataValidations, [operation]);
        changed = true;
        continue;
      }
      if (!isMatrixStructureOperation(operation)) continue;
      const entries = state.dataValidations.getRules();
      MatrixOT.apply(state.dataValidations, [projectStructureOperation(state.dataValidations, operation)]);
      const moved: PositionedDataValidationRule[] = [];
      for (const entry of entries) {
        const rect = new Rect([
          [entry.row, entry.column],
          [entry.rule.endRow, entry.rule.endColumn],
        ]);
        RectOT.apply(rect, [operation]);
        const start = rect.getPoint(0);
        const end = rect.getPoint(1);
        const sourceRange = entry.rule.condition.sourceRange;
        let transformedSource = sourceRange;
        if (sourceRange) {
          const source = new Rect([[...sourceRange.start], [...sourceRange.end]]);
          RectOT.apply(source, [operation]);
          const sourceStart = source.getPoint(0);
          const sourceEnd = source.getPoint(1);
          if (
            sourceStart[0] > sourceEnd[0] ||
            sourceStart[1] > sourceEnd[1] ||
            sourceStart[0] < 0 ||
            sourceStart[1] < 0 ||
            sourceEnd[0] >= state.dataValidations.shape[0] ||
            sourceEnd[1] >= state.dataValidations.shape[1]
          )
            continue;
          transformedSource = { start: [sourceStart[0], sourceStart[1]], end: [sourceEnd[0], sourceEnd[1]] };
        }
        if (
          start[0] <= end[0] &&
          start[1] <= end[1] &&
          start[0] >= 0 &&
          start[1] >= 0 &&
          end[0] < state.dataValidations.shape[0] &&
          end[1] < state.dataValidations.shape[1]
        ) {
          moved.push({
            row: start[0],
            column: start[1],
            rule: {
              ...entry.rule,
              endRow: end[0],
              endColumn: end[1],
              ...(transformedSource ? { condition: { ...entry.rule.condition, sourceRange: transformedSource } } : {}),
            },
          });
        }
      }
      state.dataValidations.replaceRules(moved);
      changed = true;
    }
    return changed ? state : null;
  }

  public dispose(): void {
    this.assertRuntimeWriteAllowed();
    this.#disposeValidation();
    this.#warningListeners.clear();
  }
}

function projectStructureOperation(
  matrix: DataValidationMatrix,
  operation: Operation,
): MatrixOTOperation<DataValidationRule[] | null> {
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
  throw new SearError('Unsupported data validation structure operation.');
}
