import { SheetCommandBus, SheetQueryRegistry, LocalActionCommand } from '@searsuite/sear-assembly-commands';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
import {
  ReadDataValidationCellRulesQuery,
  DataValidationKind,
  DataValidationDropdownMode,
  DataValidationInputPolicy,
  type DataValidationRule,
} from '@searsuite/sear-plugin-data-validation';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { SheetCellVisualReaderRegistry, type CellProperties } from '@searsuite/sear-render-registry';
import { FixBoxNode } from '@searsuite/sear-render-node';
import { type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import {
  SheetDropdownPlugin,
  DropdownPickerRequest,
  OpenDropdownPickerCommand,
  ReadDropdownCellQuery,
  PickDropdownOptionCommand,
  ClearDropdownValueCommand,
  DropdownError,
} from '../src';
it('uses command-owned transactions, conditional visuals and pointer requests with idempotent teardown', () => {
  const commands = new SheetCommandBus(),
    queries = new SheetQueryRegistry(),
    validation = new SheetCellInputValidationRegistry(),
    observations = new ObservationRegistry(new HeadlessPlatform()),
    visuals = new SheetCellVisualReaderRegistry();
  let enabled = true,
    allow = true,
    text = 'x';
  const rule: DataValidationRule = {
    id: 'r',
    endRow: 0,
    endColumn: 0,
    inputPolicy: DataValidationInputPolicy.Reject,
    condition: { kind: DataValidationKind.Dropdown, options: [{ label: 'x', color: '#ffeeaa' }, { label: 'y' }] },
  };
  queries.register(ReadDataValidationCellRulesQuery, () => (enabled ? [{ row: 0, column: 0, rule }] : []));
  const make = jest.fn(() => createTransaction(new PluginKey('test.cells'), [])),
    selected = jest.fn(),
    requested = jest.fn();
  const plugin = new SheetDropdownPlugin({
    queries,
    validation,
    readShape: () => [10, 10],
    readText: () => text,
    forEachSourceValue: () => {},
    createValueTransaction: make,
    beforeOpen: () => allow,
  });
  commands.bind({ executePipeline: (p) => p.steps.forEach((step) => step.localAction?.()), applyEffect: () => {} });
  commands.register(
    SelectRangeCommand,
    (input) => new LocalActionCommand(SelectRangeCommand.id, () => selected(input)),
  );
  plugin.registerCommands(commands);
  const forgedCommands = new SheetCommandBus();
  expect(() => plugin.registerCommands(forgedCommands)).toThrow('already bound');
  Object.assign(plugin, { commands: forgedCommands, ownsPointerRelease: true });
  plugin.registerQueries(queries);
  plugin.registerObservations(observations);
  plugin.registerCellVisualReaders(visuals);
  observations.subscribe(DropdownPickerRequest, requested);
  expect(queries.run(ReadDropdownCellQuery, { row: 0, column: 0 })?.selected).toEqual(['x']);
  commands.run(PickDropdownOptionCommand, { row: 0, column: 0, label: 'y' });
  expect(make).toHaveBeenCalledWith(0, 0, 'y');
  commands.run(ClearDropdownValueCommand, { row: 0, column: 0 });
  expect(make).toHaveBeenLastCalledWith(0, 0, null);
  const reject = validation.register('other', () => ({ valid: false, reject: true, message: 'conflict' }));
  expect(() => commands.run(PickDropdownOptionCommand, { row: 0, column: 0, label: 'y' })).toThrow(DropdownError);
  reject();
  expect(visuals.readVisual({ rowIndex: 0, columnIndex: 0 }).layers).toBeDefined();
  const node = new FixBoxNode<CellProperties>(
    { x: 0, y: 0, width: 100, height: 24 },
    { startRowIndex: 0, startColIndex: 0 },
  );
  const preventDefault = jest.fn();
  let scrollX = 0;
  const core = { renderEngine: {
    renderContext: { getViewScale: () => 1 },
    scrollManager: { getState: () => ({ x: scrollX }) },
  } };
  const event = (x = 90, button = 0) =>
    ({
      origin: { offsetX: x, offsetY: 12, button, preventDefault },
      target: node,
    } as unknown as EventWithOffsetAndTarget<CellProperties>);
  expect(plugin.onMouseDown(core, event(30))).toBeUndefined();
  expect(plugin.onMouseDown(core, event(90, 2))).toBeUndefined();
  allow = false;
  expect(plugin.onMouseDown(core, event())).toBe(false);
  expect(requested).not.toHaveBeenCalled();
  allow = true;
  expect(plugin.onMouseDown(core, event())).toBe(false);
  expect(plugin.onMouseUp(core, event())).toBe(false);
  const scrolledNode = new FixBoxNode<CellProperties>(
    { x: 1100, y: 0, width: 100, height: 24 },
    { startRowIndex: 0, startColIndex: 0 },
  );
  scrollX = 600;
  expect(plugin.onMouseDown(core, { ...event(590), target: scrolledNode })).toBe(false);
  expect(requested).toHaveBeenCalledTimes(2);
  expect(plugin.onMouseUp(core, event())).toBe(false);
  expect(plugin.onMouseUp(null, event())).toBeUndefined();
  expect(selected).toHaveBeenCalledWith({ anchor: [0, 0], focus: [0, 0] });
  expect(requested).toHaveBeenCalledWith({ row: 0, column: 0 });
  expect(preventDefault).toHaveBeenCalled();
  expect(plugin.onMouseDown(null, { ...event(), target: null })).toBeUndefined();
  enabled = false;
  scrollX = 0;
  expect(plugin.onMouseDown(core, event())).toBeUndefined();
  expect(visuals.readVisual({ rowIndex: 0, columnIndex: 0 }).layers ?? []).toHaveLength(0);
  commands.run(OpenDropdownPickerCommand, { row: 0, column: 0 });
  expect(requested).toHaveBeenCalledTimes(2);
  expect(plugin.registerState().dataEngine.enabled).toBe(false);
  expect(plugin.getPluginConfig()).toBeNull();
  expect(plugin.apply()).toBeNull();
  expect(plugin.render()).toBeNull();
  plugin.destroy();
  plugin.destroy();
  observations.destroy();
});

it('keeps the displayed boolean label for text-only transaction providers', () => {
  const commands = new SheetCommandBus();
  const queries = new SheetQueryRegistry();
  const validation = new SheetCellInputValidationRegistry();
  queries.register(ReadDataValidationCellRulesQuery, () => [{
    row: 0, column: 0,
    rule: {
      id: 'boolean-source', endRow: 0, endColumn: 0,
      inputPolicy: DataValidationInputPolicy.Reject,
      condition: { kind: DataValidationKind.Dropdown, sourceRange: { start: [0, 0] as const, end: [0, 0] as const } },
    },
  }]);
  validation.register('exact-label', (_row, _column, text) => ({ valid: text === 'TRUE', reject: text !== 'TRUE' }));
  const write = jest.fn(() => createTransaction(new PluginKey('test.cells'), []));
  const plugin = new SheetDropdownPlugin({
    queries, validation,
    readShape: () => [1, 1],
    readText: () => '',
    forEachSourceValue: (_start, _end, visit) => visit('TRUE', true),
    createValueTransaction: write,
  });
  commands.bind({ executePipeline: () => {}, applyEffect: () => {} });
  plugin.registerQueries(queries);
  plugin.registerCommands(commands);
  commands.run(PickDropdownOptionCommand, { row: 0, column: 0, label: 'TRUE' });
  expect(write).toHaveBeenCalledWith(0, 0, 'TRUE');
  plugin.destroy();
});

it('projects multiple colored labels without changing persisted text, and restores ordinary text when colors disappear', () => {
  const queries = new SheetQueryRegistry();
  let text = 'x,y',
    colored = true;
  queries.register(ReadDataValidationCellRulesQuery, () => [
    {
      row: 0,
      column: 0,
      rule: {
        id: 'r',
        endRow: 0,
        endColumn: 0,
        inputPolicy: DataValidationInputPolicy.Reject,
        condition: {
          kind: DataValidationKind.Dropdown,
          dropdownMode: DataValidationDropdownMode.Multiple,
          options: [
            { label: 'x', ...(colored ? { color: '#ffeeaa' } : {}) },
            { label: 'y', ...(colored ? { color: '#aaddff' } : {}) },
          ],
        },
      },
    },
  ]);
  const write = jest.fn();
  const plugin = new SheetDropdownPlugin({
    queries,
    validation: new SheetCellInputValidationRegistry(),
    readShape: () => [2, 2],
    readText: () => text,
    forEachSourceValue: () => {},
    createValueTransaction: write,
  });
  const visuals = new SheetCellVisualReaderRegistry();
  plugin.registerCellVisualReaders(visuals);
  const first = visuals.readVisual({ rowIndex: 0, columnIndex: 0 });
  expect(first.properties.hideText).toBe(true);
  expect(first.layers.find((layer) => layer.slot === 'dropdown.labels')?.labels).toEqual([
    { text: 'x', fill: '#ffeeaa' },
    { text: 'y', fill: '#aaddff' },
  ]);
  expect(text).toBe('x,y');
  expect(write).not.toHaveBeenCalled();
  colored = false;
  expect(visuals.readVisual({ rowIndex: 0, columnIndex: 0 }).properties.hideText).toBeUndefined();
  text = '';
  expect(visuals.readVisual({ rowIndex: 0, columnIndex: 0 }).layers.map((layer) => layer.slot)).toEqual([
    'dropdown.arrow',
  ]);
  plugin.destroy();
});
