import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { Pipeline } from '@searsuite/sear-assembly-plugin';
import { type SheetCommandBus, type SheetQueryRegistry, type SheetRangeInput } from '@searsuite/sear-assembly-commands';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

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
export class SheetCheckboxPlugin extends Plugin<null> {
  readonly #options: SheetCheckboxOptions;

  /** Editor-local DI token. */ public static readonly symbol = Symbol.for('SheetCheckboxPlugin');
  #commands: SheetCommandBus | null = null;
  readonly #disposers: (() => void)[] = [];
  /** Installs all type capabilities atomically into the owning editor's registries. */ public constructor(
    options: SheetCheckboxOptions,
  ) {
    super({ key: new PluginKey('SheetCheckboxPlugin'), state: null });
    this.#options = options;
    try {
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
              ...(!valid
                ? { message: 'Checkboxes accept only TRUE or FALSE. Clear the cell to remove the checkbox.' }
                : {}),
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
  /** No independent document state is registered. */ public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
  /** The feature never owns or directly applies cell state. */ public apply(): null {
    return null;
  }
  /** Restores all replaced capabilities and releases handlers idempotently. */ public destroy(): void {
    this.assertRuntimeWriteAllowed();
    this.#commands = null;
    for (const dispose of this.#disposers.splice(0).reverse()) dispose();
  }
}
