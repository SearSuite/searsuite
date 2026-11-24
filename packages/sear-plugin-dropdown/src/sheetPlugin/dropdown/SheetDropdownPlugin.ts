import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { Pipeline, runOutsideCommandExecution, type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type SheetCommandBus, type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type CellProperties, type SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import { CellVisualIconShape } from '@searsuite/sear-render-node';
import { type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import {
  ReadDataValidationCellRulesQuery,
  DataValidationKind,
  DataValidationDropdownMode,
  resolveDropdownSelection,
} from '@searsuite/sear-plugin-data-validation';
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
export class SheetDropdownPlugin extends Plugin<unknown, CellProperties, null> {
  readonly #options: SheetDropdownOptions;

  /** Editor-local service token. */ public static readonly symbol = Symbol.for('SheetDropdownPlugin');
  /** Handles arrows before ordinary selection. */ public override readonly depth = -24;
  /** Several stateless interaction extensions may share depth. */ public override readonly warnOnDuplicateDepth =
    false;
  #commands: SheetCommandBus | null = null;
  #ownsPointerRelease = false;
  readonly #listeners = new Set<(input: DropdownCellInput) => void>();
  /** Receives owner-scoped projections and semantic transaction factories. */
  constructor(options: SheetDropdownOptions) {
    super({ key: new PluginKey('SheetDropdownPlugin'), state: null });
    this.#options = options;
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
      const text = typeof value === 'number' || typeof value === 'boolean'
        ? label ?? String(value) : value ?? '';
      const result = this.#options.validation.validate(input.row, input.column, text);
      if (result.reject)
        throw new DropdownError(
          DropdownErrorCode.Conflict,
          result.message ?? 'Value conflicts with another validation rule.',
        );
      const pipeline = new Pipeline(id);
      const transaction = typeof value === 'number' || typeof value === 'boolean'
        ? this.#options.createTypedValueTransaction?.(input.row, input.column, value)
          ?? this.#options.createValueTransaction(input.row, input.column, text)
        : this.#options.createValueTransaction(input.row, input.column, value);
      pipeline.addTransaction('dropdown.value', transaction);
      return { id, execute: () => ({ pipeline }) };
    };
    commands.register(PickDropdownOptionCommand, (input) =>
      change(PickDropdownOptionCommand.id, input, planDropdownValue(readDropdownCell(input, this.#options), input), input.label),
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
        pipeline.addLocalAction('dropdown.request', () => runOutsideCommandExecution(() =>
          this.#listeners.forEach((listener) => listener({ row: input.row, column: input.column })),
        ));
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
  /** Adds viewport-bounded arrows and option color layers without taking fill ownership. */ registerCellVisualReaders(
    registry: SheetCellVisualReaderRegistry,
  ): void {
    registry.registerConditional({
      id: 'sheet.dropdown',
      properties: ['hideText'],
      read: ({ rowIndex, columnIndex }) => {
        const entry = this.#options.queries
          .run(ReadDataValidationCellRulesQuery, [rowIndex, columnIndex])
          .filter(({ rule }) => rule.condition.kind === DataValidationKind.Dropdown)
          .at(-1);
        if (!entry) return [];
        const condition = entry.rule.condition,
          layers = [];
        const text = this.#options.readText(rowIndex, columnIndex);
        const selected = text
          ? condition.dropdownMode === DataValidationDropdownMode.Multiple
            ? resolveDropdownSelection(text, (condition.options ?? []).map((option) => option.label))
            : [text]
          : [];
        const colors = new Map((condition.options ?? []).map((option) => [option.label, option.color]));
        const hasLabels = selected.some((label) => colors.get(label));
        if (hasLabels)
          layers.push({
            slot: 'dropdown.labels',
            x: 0,
            y: 0,
            width: condition.showDropdownArrow === false ? 1 : 0.8,
            height: 1,
            labels: selected.map((label) => ({ text: label, fill: colors.get(label) ?? '#eef0f4' })),
          });
        if (condition.showDropdownArrow !== false)
          layers.push({
            slot: 'dropdown.arrow',
            x: 0.8,
            y: 0,
            width: 0.2,
            height: 1,
            icon: { shape: CellVisualIconShape.Down, color: '#64748b' },
          });
        return [
          { id: 'sheet.dropdown', priority: 0, ...(hasLabels ? { properties: { hideText: true } } : {}), layers },
        ];
      },
    });
  }
  /** Activates the trailing cell arrow through the public command bus. */ onMouseDown(
    core: unknown,
    event: EventWithOffsetAndTarget<CellProperties>,
  ): boolean | void {
    this.#ownsPointerRelease = false;
    const node = event.target,
      props = node?.properties;
    if (!node || !props || (event.origin.button ?? 0) !== 0) return;
    const row = props.startRowIndex,
      column = props.startColIndex;
    if (row === undefined || column === undefined) return;
    const render = (core as SearCoreSheet).renderEngine;
    const worldX = event.origin.offsetX / render.renderContext.getViewScale() + render.scrollManager.getState().x;
    if (worldX < node.x + node.width * 0.8 || worldX > node.x + node.width) return;
    const entries = this.#options.queries
      .run(ReadDataValidationCellRulesQuery, [row, column])
      .filter(({ rule }) => rule.condition.kind === DataValidationKind.Dropdown);
    if (!entries.length || entries.at(-1)!.rule.condition.showDropdownArrow === false) return;
    if (this.#options.beforeOpen && !this.#options.beforeOpen()) return false;
    this.#ownsPointerRelease = true;
    this.#commands?.run(SelectRangeCommand, { anchor: [row, column], focus: [row, column] });
    this.#commands?.run(OpenDropdownPickerCommand, { row, column });
    event.origin.preventDefault();
    return false;
  }
  /** Keeps an arrow release from returning focus to the cell text editor. */
  public onMouseUp(_core: unknown, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if (!this.#ownsPointerRelease) return;
    this.#ownsPointerRelease = false;
    event.origin.preventDefault();
    return false;
  }
  /** No duplicate document field is created. */ registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
  /** No independent render configuration. */ getPluginConfig(): null {
    return null;
  }
  /** Mutations belong to validation and cell owners. */ apply(): null {
    return null;
  }
  /** Cell visual readers supply all adornments. */ render(): null {
    return null;
  }
  /** Releases transient host subscriptions. */ destroy(): void {
    this.#commands = null;
    this.#ownsPointerRelease = false;
    this.#listeners.clear();
  }
}
