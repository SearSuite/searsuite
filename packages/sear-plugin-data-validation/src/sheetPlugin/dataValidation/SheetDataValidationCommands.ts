import {
  createSheetTransaction, defineSheetCommand, defineSheetQuery, SheetCommandBus, SheetQueryRegistry,
  TransactionPipelineCommand, type SheetRangeInput,
} from '@searsuite/sear-assembly-commands';
import { subtractSheetMoveRange, type PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { SearError } from '@searsuite/sear-foundation-error';
import { type DataValidationMatrix, type PositionedDataValidationRule } from '../../DataValidationMatrix';
import {
  assertDataValidationRule, DataValidationDropdownMode, DataValidationInputPolicy, DataValidationKind,
  type DataValidationCondition,
  type DataValidationRule,
} from '../../DataValidationRule';
import { type DataValidationIssue } from '../../DataValidationIssue';

/** Target range and rule settings for creating or editing a rule. */
export interface SetDataValidationRuleInput extends SheetRangeInput {
  readonly rule: Omit<DataValidationRule, 'id' | 'endRow' | 'endColumn'>;
  readonly id?: string;
}
/** Creates or updates a validation rule for a sheet range. */
export const SetDataValidationRuleCommand = defineSheetCommand<SetDataValidationRuleInput>('dataValidation.setRule');
/** Removes a rule by its stable identifier. */
export const RemoveDataValidationRuleCommand = defineSheetCommand<{ readonly id: string }>('dataValidation.removeRule');
/** Removes every rule, or only rule fragments within a range. */
export const ClearDataValidationRulesCommand = defineSheetCommand<{ readonly range?: SheetRangeInput }>('dataValidation.clearRules');
/** Reads all persisted validation rules and their range anchors. */
export const ReadDataValidationRulesQuery = defineSheetQuery<void, readonly PositionedDataValidationRule[]>('dataValidation.readRules');
/** Reads the rules that cover one cell. */
export const ReadDataValidationCellRulesQuery = defineSheetQuery<readonly [number, number], readonly PositionedDataValidationRule[]>(
  'dataValidation.readCellRules',
);
/** Reads a definite validation failure for the current value of one cell. */
export const ReadDataValidationIssueQuery = defineSheetQuery<readonly [number, number], DataValidationIssue | null>(
  'dataValidation.readIssue',
);
/** Reads evaluator availability for the current editor. */
export const CanEvaluateDataValidationKindQuery = defineSheetQuery<DataValidationKind, boolean>(
  'dataValidation.canEvaluateKind',
);
/** Writes a numeric rule control through the ordinary SheetData transaction owner. */
export const SetNumericValidationControlValueCommand = defineSheetCommand<{
  readonly row: number;
  readonly column: number;
  readonly value: number;
}>('dataValidation.setNumericControlValue');

/** Registers the rule mutation commands with an editor-local command bus. */
export function registerDataValidationCommands(
  commands: SheetCommandBus,
  target: PluginKey,
  readMatrix: () => DataValidationMatrix,
  createId: () => string,
  evaluate: (condition: DataValidationCondition, text: string, row: number, column: number) => boolean | null,
): void {
  commands.register(SetDataValidationRuleCommand, (input) => {
    const matrix = readMatrix();
    const [row, column, endRow, endColumn] = normalizeRange(input, matrix);
    const rule: DataValidationRule = { ...input.rule, id: input.id ?? createId(), endRow, endColumn };
    assertDataValidationRule(rule, row, column, matrix.shape);
    assertCompatibleWithExistingRules(matrix, rule, row, column, evaluate);
    const previous = matrix.getItem(row, column);
    const next = [...(previous ?? []).filter((candidate) => candidate.id !== rule.id), rule];
    const operations = [];
    const oldAnchor = input.id && matrix.getRules().find(({ rule: candidate }) => candidate.id === input.id);
    if (oldAnchor && (oldAnchor.row !== row || oldAnchor.column !== column)) {
      const oldRules = matrix.getItem(oldAnchor.row, oldAnchor.column);
      const remaining = oldRules?.filter((candidate) => candidate.id !== rule.id) ?? [];
      operations.push(createUpdateCellOTOperation([oldAnchor.row, oldAnchor.column],
        remaining.length ? remaining : null, oldRules));
    }
    operations.push(createUpdateCellOTOperation([row, column], next, previous));
    return new TransactionPipelineCommand(SetDataValidationRuleCommand.id,
      createSheetTransaction(target, operations));
  });
  commands.register(RemoveDataValidationRuleCommand, ({ id }) => {
    const matrix = readMatrix();
    const found = matrix.getRules().find(({ rule }) => rule.id === id);
    if (!found) return new TransactionPipelineCommand(RemoveDataValidationRuleCommand.id, createSheetTransaction(target, []));
    const previous = matrix.getItem(found.row, found.column);
    const next = previous?.filter((rule) => rule.id !== id) ?? [];
    return new TransactionPipelineCommand(RemoveDataValidationRuleCommand.id,
      createSheetTransaction(target, [createUpdateCellOTOperation([found.row, found.column], next.length ? next : null, previous)]));
  });
  commands.register(ClearDataValidationRulesCommand, ({ range }) => {
    const matrix = readMatrix();
    const bounds = range ? normalizeRange(range, matrix) : null;
    const changes = new Map<string, { row: number; column: number; rules: DataValidationRule[] }>();
    const update = (row: number, column: number) => {
      const key = `${row}:${column}`;
      let change = changes.get(key);
      if (!change) {
        change = { row, column, rules: matrix.getItem(row, column) ?? [] };
        changes.set(key, change);
      }
      return change;
    };
    for (const { row, column, rule } of matrix.getRules()) {
      if (bounds && (row > bounds[2] || column > bounds[3] || rule.endRow < bounds[0] || rule.endColumn < bounds[1])) continue;
      update(row, column).rules = update(row, column).rules.filter((entry) => entry.id !== rule.id);
      if (!bounds) continue;
      for (const remainder of subtractSheetMoveRange(
        { start: [row, column], end: [rule.endRow, rule.endColumn] },
        { start: [bounds[0], bounds[1]], end: [bounds[2], bounds[3]] },
      )) {
        const [top, left] = remainder.start;
        update(top, left).rules.push({ ...rule, id: createId(), endRow: remainder.end[0], endColumn: remainder.end[1] });
      }
    }
    const operations = [...changes.values()].map(({ row, column, rules }) =>
      createUpdateCellOTOperation([row, column], rules.length ? rules : null, matrix.getItem(row, column)));
    return new TransactionPipelineCommand(ClearDataValidationRulesCommand.id, createSheetTransaction(target, operations));
  });
}

/** Registers rule reads with an editor-local query registry. */
export function registerDataValidationQueries(
  queries: SheetQueryRegistry,
  readMatrix: () => DataValidationMatrix,
  readIssue: (row: number, column: number) => DataValidationIssue | null,
  canEvaluateKind: (kind: DataValidationKind) => boolean,
): void {
  queries.register(ReadDataValidationRulesQuery, () => readMatrix().getRules());
  queries.register(ReadDataValidationCellRulesQuery, ([row, column]) => readMatrix().findRules(row, column));
  queries.register(ReadDataValidationIssueQuery, ([row, column]) => readIssue(row, column));
  queries.register(CanEvaluateDataValidationKindQuery, canEvaluateKind);
}

function assertCompatibleWithExistingRules(
  matrix: DataValidationMatrix, rule: DataValidationRule, row: number, column: number,
  evaluate: (condition: DataValidationCondition, text: string, row: number, column: number) => boolean | null,
): void {
  if (rule.inputPolicy !== DataValidationInputPolicy.Reject) return;
  for (const existing of matrix.getRules()) {
    if (existing.rule.id === rule.id || existing.rule.inputPolicy !== DataValidationInputPolicy.Reject ||
      existing.row > rule.endRow || existing.column > rule.endColumn ||
      existing.rule.endRow < row || existing.rule.endColumn < column) continue;
    const dropdown = rule.condition.kind === DataValidationKind.Dropdown ? rule :
      existing.rule.condition.kind === DataValidationKind.Dropdown ? existing.rule : null;
    if (!dropdown || dropdown.condition.sourceRange || !dropdown.condition.options?.length ||
      dropdown.condition.dropdownMode === DataValidationDropdownMode.Multiple) continue;
    const other = dropdown === rule ? existing.rule : rule;
    const overlapRow = Math.max(row, existing.row);
    const overlapColumn = Math.max(column, existing.column);
    const candidates = dropdown.condition.options.map(({ label }) => label);
    if (candidates.some((label) => evaluate(other.condition, label, overlapRow, overlapColumn) !== false)) continue;
    throw new SearError('Overlapping validation rules have no valid input.');
  }
}

function normalizeRange(input: SheetRangeInput, matrix: DataValidationMatrix): [number, number, number, number] {
  const { anchor, focus } = input;
  if (![...anchor, ...focus].every(Number.isInteger)) throw new SearError('Validation range requires integer coordinates.');
  const row = Math.min(anchor[0], focus[0]);
  const column = Math.min(anchor[1], focus[1]);
  const endRow = Math.max(anchor[0], focus[0]);
  const endColumn = Math.max(anchor[1], focus[1]);
  if (row < 0 || column < 0 || endRow >= matrix.shape[0] || endColumn >= matrix.shape[1]) {
    throw new SearError('Validation range is outside sheet bounds.');
  }
  return [row, column, endRow, endColumn];
}
