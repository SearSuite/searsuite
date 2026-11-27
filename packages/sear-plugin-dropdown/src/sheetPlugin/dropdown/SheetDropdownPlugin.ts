import { readDropdownIndicator, type DropdownIndicator } from '../../readDropdownIndicator';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';

import { Pipeline, runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { type SheetCommandBus, type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

import {
  DropdownPickerRequest,
  ReadDropdownCellQuery,
  PickDropdownOptionCommand,
  ClearDropdownValueCommand,
  OpenDropdownPickerCommand,
  type DropdownCellInput,
} from '../../DropdownContracts';
import { DropdownError, DropdownErrorCode } from '../../DropdownError';
import { type SheetDropdownOptions } from '../../SheetDropdownOptions';
import { readDropdownCell } from '../../readDropdownCell';
import { planDropdownValue } from '../../planDropdownValue';
/** Stateless dropdown interaction; rules and values retain their existing document owners. */
@Injectable()
export class SheetDropdownPlugin extends Plugin<null> {
  readonly #options: SheetDropdownOptions;

  /** Editor-local service token. */ public static readonly symbol = Symbol.for('SheetDropdownPlugin');
  #commands: SheetCommandBus | null = null;
  readonly #listeners = new Set<(input: DropdownCellInput) => void>();
  /** Receives owner-scoped projections and semantic transaction factories. */
  constructor(options: SheetDropdownOptions) {
    super({ key: new PluginKey('SheetDropdownPlugin'), state: null });
    this.#options = options;
  }
  public readIndicator(row: number, column: number): DropdownIndicator | null {
    return readDropdownIndicator(row, column, this.#options);
  }

  /** Publishes a typed, current-cell query. */ registerQueries(queries: SheetQueryRegistry): void {
    queries.register(ReadDropdownCellQuery, (input) => readDropdownCell(input, this.#options));
  }
  /** Registers value changes and a transient picker request command. */ registerCommands(
    commands: SheetCommandBus,
  ): void {
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet dropdown commands are already bound to an editor.');
    }
    this.#commands = commands;
    const change = (id: string, input: DropdownCellInput, value: string | number | boolean | null, label?: string) => {
      const text = typeof value === 'number' || typeof value === 'boolean' ? label ?? String(value) : value ?? '';
      const result = this.#options.validation.validate(input.row, input.column, text);
      if (result.reject)
        throw new DropdownError(
          DropdownErrorCode.Conflict,
          result.message ?? 'Value conflicts with another validation rule.',
        );
      const pipeline = new Pipeline(id);
      const transaction =
        typeof value === 'number' || typeof value === 'boolean'
          ? this.#options.createTypedValueTransaction?.(input.row, input.column, value) ??
            this.#options.createValueTransaction(input.row, input.column, text)
          : this.#options.createValueTransaction(input.row, input.column, value);
      pipeline.addTransaction('dropdown.value', transaction);
      return { id, execute: () => ({ pipeline }) };
    };
    commands.register(PickDropdownOptionCommand, (input) =>
      change(
        PickDropdownOptionCommand.id,
        input,
        planDropdownValue(readDropdownCell(input, this.#options), input),
        input.label,
      ),
    );
    commands.register(ClearDropdownValueCommand, (input) => {
      if (!readDropdownCell(input, this.#options))
        throw new DropdownError(DropdownErrorCode.Stale, 'Dropdown rule is unavailable.');
      return change(ClearDropdownValueCommand.id, input, null);
    });
    commands.register(OpenDropdownPickerCommand, (input) => {
      const state = readDropdownCell(input, this.#options),
        pipeline = new Pipeline(OpenDropdownPickerCommand.id);
      if (state)
        pipeline.addLocalAction('dropdown.request', () =>
          runOutsideCommandExecution(() =>
            this.#listeners.forEach((listener) => listener({ row: input.row, column: input.column })),
          ),
        );
      return { id: OpenDropdownPickerCommand.id, execute: () => ({ pipeline }) };
    });
  }
  /** Host listener failures are isolated by the editor observation registry. */ registerObservations(
    registry: ObservationRegistry,
  ): void {
    registry.register(DropdownPickerRequest, {
      subscribe: (listener) => {
        this.#listeners.add(listener);
        return () => {
          this.#listeners.delete(listener);
        };
      },
    });
  }
  /** No duplicate document field is created. */ registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
  /** Mutations belong to validation and cell owners. */ apply(): null {
    return null;
  }
  /** Releases transient host subscriptions. */ destroy(): void {
    this.#commands = null;
    this.#listeners.clear();
  }
}
