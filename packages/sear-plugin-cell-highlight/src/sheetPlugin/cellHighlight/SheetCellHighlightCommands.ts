import {
  createSheetTransaction, defineSheetCommand, defineSheetQuery, SheetCommandBus, SheetQueryRegistry,
  TransactionPipelineCommand, type SheetCommandResult, type SheetRangeInput,
} from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { SearError } from '@searsuite/sear-foundation-error';
import { type CellHighlightMatrix, type PositionedCellHighlightRule } from '../../CellHighlightMatrix';
import { assertCellHighlightRule, type CellHighlightCondition, type CellHighlightRule, type CellHighlightStyle } from '../../CellHighlightRule';
import { createReplaceCellHighlightRuleOperations } from './CellHighlightRuleTransfer';

export interface AddCellHighlightRuleInput extends SheetRangeInput {
  readonly condition: CellHighlightCondition;
  readonly style: CellHighlightStyle;
}
export interface UpdateCellHighlightRuleInput extends AddCellHighlightRuleInput { readonly id: string }
export interface RemoveCellHighlightRuleInput { readonly id: string }
export interface ClearCellHighlightRulesInput {
  readonly range?: SheetRangeInput;
  readonly historyGroup?: SheetCommandResult['historyGroup'];
}

export const AddCellHighlightRuleCommand = defineSheetCommand<AddCellHighlightRuleInput>('cellHighlight.addRule');
export const UpdateCellHighlightRuleCommand = defineSheetCommand<UpdateCellHighlightRuleInput>('cellHighlight.updateRule');
export const RemoveCellHighlightRuleCommand = defineSheetCommand<RemoveCellHighlightRuleInput>('cellHighlight.removeRule');
export const ClearCellHighlightRulesCommand = defineSheetCommand<ClearCellHighlightRulesInput>('cellHighlight.clearRules');
export const ReadCellHighlightRulesQuery = defineSheetQuery<void, readonly PositionedCellHighlightRule[]>('cellHighlight.readRules');

export interface CellHighlightCommandSource {
  readonly target: PluginKey;
  readMatrix(): CellHighlightMatrix;
  createId(): string;
  readonly nextPriority?: (() => number) | undefined;
}

export function registerCellHighlightCommands(commands: SheetCommandBus, source: CellHighlightCommandSource): void {
  commands.register(AddCellHighlightRuleCommand, (input) => {
    const matrix = source.readMatrix();
    const [startRow, startColumn, endRow, endColumn] = normalizeRange(input, matrix);
    const rule: CellHighlightRule = {
      id: source.createId(),
      priority: source.nextPriority?.() ?? matrix.getRules().reduce((max, entry) => Math.max(max, entry.rule.priority), 0) + 1,
      endRow, endColumn, condition: { ...input.condition }, style: input.style,
    };
    assertCellHighlightRule(rule, startRow, startColumn, matrix.shape);
    const previous = matrix.getItem(startRow, startColumn);
    const operations = [createUpdateCellOTOperation([startRow, startColumn], [...(previous ?? []), rule], previous)];
    return new TransactionPipelineCommand(AddCellHighlightRuleCommand.id, createSheetTransaction(source.target, operations));
  });
  commands.register(UpdateCellHighlightRuleCommand, (input) => {
    const matrix = source.readMatrix();
    const previousRule = matrix.getRules().find(({ rule }) => rule.id === input.id);
    if (!previousRule) throw new SearError('Cell highlight rule does not exist.', { id: input.id });
    const [row, column, endRow, endColumn] = normalizeRange(input, matrix);
    const updatedRule: CellHighlightRule = {
      ...previousRule.rule, endRow, endColumn, condition: { ...input.condition }, style: input.style,
    };
    assertCellHighlightRule(updatedRule, row, column, matrix.shape);
    const sameAnchor = previousRule.row === row && previousRule.column === column;
    const previous = matrix.getItem(row, column);
    const next = sameAnchor
      ? previous!.map((rule) => rule.id === input.id ? updatedRule : rule)
      : [...(previous ?? []), updatedRule];
    const operations: UpdateCellOTOperation<CellHighlightRule[] | null>[] = [];
    if (!sameAnchor) {
      const oldRules = matrix.getItem(previousRule.row, previousRule.column);
      const remaining = oldRules?.filter((rule) => rule.id !== input.id) ?? [];
      operations.push(createUpdateCellOTOperation([previousRule.row, previousRule.column],
        remaining.length ? remaining : null, oldRules));
    }
    operations.push(createUpdateCellOTOperation([row, column], next, previous));
    return new TransactionPipelineCommand(UpdateCellHighlightRuleCommand.id, createSheetTransaction(source.target, operations));
  });
  commands.register(RemoveCellHighlightRuleCommand, (input) => {
    const matrix = source.readMatrix();
    const found = matrix.getRules().find((entry) => entry.rule.id === input.id);
    const operations: UpdateCellOTOperation<CellHighlightRule[] | null>[] = [];
    if (found) {
      const previous = matrix.getItem(found.row, found.column);
      const next = previous?.filter((rule) => rule.id !== input.id) ?? [];
      operations.push(createUpdateCellOTOperation([found.row, found.column], next.length ? next : null, previous));
    }
    return new TransactionPipelineCommand(RemoveCellHighlightRuleCommand.id, createSheetTransaction(source.target, operations));
  });
  commands.register(ClearCellHighlightRulesCommand, (input) => {
    const matrix = source.readMatrix();
    const bounds = input.range ? normalizeRange(input.range, matrix) : null;
    const operations = createReplaceCellHighlightRuleOperations(matrix, bounds, source.createId);
    return new TransactionPipelineCommand(
      ClearCellHighlightRulesCommand.id, createSheetTransaction(source.target, operations), input.historyGroup,
    );
  });
}

export function registerCellHighlightQueries(queries: SheetQueryRegistry, readMatrix: () => CellHighlightMatrix): void {
  queries.register(ReadCellHighlightRulesQuery, () => readMatrix().getRules().sort((a, b) => a.rule.priority - b.rule.priority));
}

function normalizeRange(input: SheetRangeInput, matrix: CellHighlightMatrix): [number, number, number, number] {
  const { anchor, focus } = input;
  if (![...anchor, ...focus].every(Number.isInteger)) throw new SearError('Cell highlight range must contain integer coordinates.');
  const startRow = Math.min(anchor[0], focus[0]);
  const startColumn = Math.min(anchor[1], focus[1]);
  const endRow = Math.max(anchor[0], focus[0]);
  const endColumn = Math.max(anchor[1], focus[1]);
  if (startRow < 0 || startColumn < 0 || endRow >= matrix.shape[0] || endColumn >= matrix.shape[1])
    throw new SearError('Cell highlight range is outside sheet bounds.');
  return [startRow, startColumn, endRow, endColumn];
}
