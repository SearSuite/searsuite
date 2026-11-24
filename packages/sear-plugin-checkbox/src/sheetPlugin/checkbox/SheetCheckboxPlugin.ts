import { CursorRuleKind, CursorRulePriority, CursorToken } from '@searsuite/sear-render-cursor';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { Pipeline } from '@searsuite/sear-assembly-core';
import { type SheetCommandBus, type SheetQueryRegistry, type SheetRangeInput } from '@searsuite/sear-assembly-commands';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { createFormulaError, FormulaErrorCode } from '@searsuite/sear-domain-formula-engine';
import { CheckboxCellTypeDefinition } from '../../CheckboxCellTypeDefinition';
import { CheckboxCellType, CheckboxRemovalMode, isCheckboxCell, parseCheckboxText } from '../../CheckboxCellValue';
import {
  InsertCheckboxesCommand,
  SetCheckboxesCommand,
  ToggleCheckboxesCommand,
  RemoveCheckboxesCommand,
  ReadCheckboxRangeQuery,
} from '../../CheckboxCommands';
import { normalizeCheckboxRange } from '../../normalizeCheckboxRange';
import { readCheckboxRange, planInsertCheckboxes, planCheckboxChanges } from '../../planCheckboxWrites';
import { type SheetCheckboxOptions, type CheckboxCellWrite } from '../../SheetCheckboxOptions';
/** Stateless feature; persistent values, history and collaboration belong to the ordinary cell owner. */
@Injectable()
export class SheetCheckboxPlugin extends Plugin<unknown, CellProperties, null> {
  readonly #options: SheetCheckboxOptions;

  /** Editor-local DI token. */ public static readonly symbol = Symbol.for('SheetCheckboxPlugin');
  /** Intercepts glyph hits before selection and text editing. */ public override readonly depth = -25;
  /** Stateless input features need no duplicate-depth warning. */ public override readonly warnOnDuplicateDepth =
    false;
  #commands: SheetCommandBus | null = null;
  readonly #disposers: (() => void)[] = [];
  /** Installs all type capabilities atomically into the owning editor's registries. */ public constructor(
    options: SheetCheckboxOptions,
  ) {
    super({ key: new PluginKey('SheetCheckboxPlugin'), state: null });
    this.#options = options;
    try {
      if (options.cursor)
        this.#disposers.push(
          options.cursor.register({
            kind: CursorRuleKind.Predicate,
            key: 'sheet.checkbox',
            priority: CursorRulePriority.High,
            test: (props) => props.semanticOwner === CheckboxCellType,
            cursor: CursorToken.Pointer,
          }),
        );
      this.#disposers.push(options.catalog.register(new CheckboxCellTypeDefinition(options.hasCheckboxRule)));
      if (options.formulas)
        this.#disposers.push(
          options.formulas.register({
            cellType: CheckboxCellType,
            toFormulaValue: (cell) => (isCheckboxCell(cell) ? cell.value : createFormulaError(FormulaErrorCode.Value)),
          }),
        );
      if (options.inputValidation)
        this.#disposers.push(
          options.inputValidation.register('sheet.checkbox', (row, column, text) => {
            const owns = isCheckboxCell(options.readCell(row, column)) && !options.hasCheckboxRule?.(row, column),
              valid = !owns || !text.trim() || parseCheckboxText(text) !== null;
            return {
              valid,
              reject: !valid,
              ...(!valid ? { message: 'Checkboxes accept only TRUE or FALSE. Clear the cell to remove the checkbox.' } : {}),
            };
          }),
        );
    } catch (error) {
      this.destroy();
      throw error;
    }
  }
  /** Registers owner-targeted commands; each change is one staged cell transaction. */ public registerCommands(
    commands: SheetCommandBus,
  ): void {
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet checkbox commands are already bound to an editor.');
    }
    this.#commands = commands;
    const range = (input: SheetRangeInput) => normalizeCheckboxRange(input, this.#options.readShape()),
      pipeline = (id: string, writes: readonly CheckboxCellWrite[]) => {
        const p = new Pipeline(id);
        if (writes.length) p.addTransaction('checkbox.cells', this.#options.createTransaction(writes));
        return { id, execute: () => ({ pipeline: p }) };
      };
    commands.register(InsertCheckboxesCommand, (input) =>
      pipeline(InsertCheckboxesCommand.id, planInsertCheckboxes(input, range(input), this.#options)),
    );
    commands.register(SetCheckboxesCommand, (input) =>
      pipeline(SetCheckboxesCommand.id, planCheckboxChanges(range(input), this.#options, input.checked)),
    );
    commands.register(ToggleCheckboxesCommand, (input) => {
      const r = range(input),
        state = readCheckboxRange(r, this.#options);
      return pipeline(
        ToggleCheckboxesCommand.id,
        planCheckboxChanges(r, this.#options, state.count === 0 ? true : state.checked !== state.count),
      );
    });
    commands.register(RemoveCheckboxesCommand, (input) =>
      pipeline(
        RemoveCheckboxesCommand.id,
        planCheckboxChanges(range(input), this.#options, null, input.mode ?? CheckboxRemovalMode.Text),
      ),
    );
  }
  /** Publishes sparse range-state reads. */ public registerQueries(queries: SheetQueryRegistry): void {
    queries.register(ReadCheckboxRangeQuery, (input) =>
      readCheckboxRange(normalizeCheckboxRange(input, this.#options.readShape()), this.#options),
    );
  }
  /** Changes a glyph through typed selection and toggle commands, never through direct matrix mutation. */ public onMouseDown(
    _core: unknown,
    event: EventWithOffsetAndTarget<CellProperties>,
  ): boolean | void {
    const props = event.target?.properties;
    if (props?.semanticOwner !== CheckboxCellType || (event.origin.button ?? 0) !== 0) return;
    const row = props.startRowIndex,
      column = props.startColIndex;
    if (row === undefined || column === undefined || !this.#commands) return false;
    event.origin.preventDefault();
    if (this.#options.beforeToggle && !this.#options.beforeToggle()) return false;
    if (this.#commands.has(SelectRangeCommand))
      this.#commands.run(SelectRangeCommand, { anchor: [row, column], focus: [row, column] });
    this.#commands.run(ToggleCheckboxesCommand, { anchor: [row, column], focus: [row, column] });
    event.origin.preventDefault();
    return false;
  }
  /** Consumes glyph double-clicks so they do not enter text editing. */ public onDblClick(
    _core: unknown,
    event: EventWithOffsetAndTarget<CellProperties>,
  ): boolean | void {
    if (event.target?.properties.semanticOwner === CheckboxCellType) return false;
  }
  /** No independent document state is registered. */ public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
  /** No render configuration is contributed. */ public getPluginConfig(): null {
    return null;
  }
  /** The feature never owns or directly applies cell state. */ public apply(): null {
    return null;
  }
  /** Glyphs are rendered by the catalog's ordinary cell renderer. */ public render(): null {
    return null;
  }
  /** Restores all replaced capabilities and releases handlers idempotently. */ public destroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#commands = null;
    for (const dispose of this.#disposers.splice(0).reverse()) dispose();
  }
}
