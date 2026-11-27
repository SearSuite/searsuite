import { SheetCheckboxView } from '../src/sheet/checkbox/SheetCheckboxView';
import { CheckboxCell } from '../src/sheet/checkbox/CheckboxCell';
import { CheckboxGlyphNode } from '../src/sheet/checkbox/CheckboxGlyphNode';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { type CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { SheetCellInputValidationRegistry, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { CellFormulaValueConverterRegistry } from '@searsuite/sear-plugin-formula';
import { HeadlessRenderContext } from '@searsuite/sear-render-context';
import { CursorRegistry } from '@searsuite/sear-render-cursor';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import {
  SheetCheckboxPlugin,
  CheckboxCellTypeDefinition,
  CheckboxCellCommitStrategy,
  CheckboxCellType,
  InsertCheckboxesCommand,
  SetCheckboxesCommand,
  ToggleCheckboxesCommand,
  RemoveCheckboxesCommand,
  ReadCheckboxRangeQuery,
  CheckboxRemovalMode,
  CheckboxError,
  normalizeCheckboxRange,
  parseCheckboxText,
  type SheetCheckboxOptions,
} from '@searsuite/sear-plugin-checkbox';
function harness(isMergedCoveredCell?: (row: number, column: number) => boolean) {
  const map = new Map<string, CellMatrixElement>(),
    dispose = jest.fn(),
    catalog = { register: jest.fn(() => dispose) } as unknown as CellTypeCatalog,
    formulas = new CellFormulaValueConverterRegistry(new HeadlessPlatform()),
    inputValidation = new SheetCellInputValidationRegistry();
  let hasRule = false;
  const options: SheetCheckboxOptions = {
    catalog,
    formulas,
    inputValidation,
    hasCheckboxRule: () => hasRule,
    ...(isMergedCoveredCell ? { isMergedCoveredCell } : {}),
    readShape: () => [1000001, 30],
    readCell: (r, c) => map.get(`${r}:${c}`) ?? null,
    forEachStored: (range, visit) => {
      for (const [key, cell] of map) {
        const [r, c] = key.split(':').map(Number) as [number, number];
        if (r >= range.anchor[0] && r <= range.focus[0] && c >= range.anchor[1] && c <= range.focus[1])
          visit(cell, r, c);
      }
    },
    createTransaction: (writes) =>
      createTransaction(
        SheetDataPlugin.pluginKey,
        writes.map((w) =>
          createUpdateCellOTOperation([w.row, w.column], w.cell, map.get(`${w.row}:${w.column}`) ?? null),
        ),
      ),
  };
  const plugin = new SheetCheckboxPlugin(options),
    commands = new SheetCommandBus(),
    queries = new SheetQueryRegistry();
  plugin.registerCommands(commands);
  const forgedCommands = new SheetCommandBus();
  expect(() => plugin.registerCommands(forgedCommands)).toThrow('already bound');
  Object.assign(plugin, { commands: forgedCommands });
  plugin.registerQueries(queries);
  commands.bind({
    executePipeline: (p) =>
      p.steps.forEach((s) => {
        for (const op of s.transaction?.operations ?? [])
          if ('uc' in op) {
            const value = (op.uc as { value: CellMatrixElement | null }).value;
            if (value) map.set(op.p.join(':'), value);
            else map.delete(op.p.join(':'));
          }
      }),
    applyEffect: () => {},
  });
  return {
    map,
    plugin,
    commands,
    queries,
    dispose,
    inputValidation,
    formulas,
    setRule: (v: boolean) => {
      hasRule = v;
    },
    options,
  };
}
it('BUG-869 inserts only at the visible anchor of a merged range', () => {
  const h = harness((row, column) => row >= 3 && row <= 4 && column >= 1 && column <= 3 && (row !== 3 || column !== 1));
  const range = { anchor: [3, 1] as [number, number], focus: [4, 3] as [number, number] };
  h.commands.run(InsertCheckboxesCommand, { ...range, replaceExisting: true });
  expect(h.queries.run(ReadCheckboxRangeQuery, range).count).toBe(1);
  expect([...h.map.keys()]).toEqual(['3:1']);
  h.plugin.destroy();
});
it('handles sparse mixed-state ranges, explicit replacement and bounded atomic planning', () => {
  const h = harness(),
    range = { anchor: [0, 0] as [number, number], focus: [1, 1] as [number, number] };
  h.commands.run(InsertCheckboxesCommand, range);
  expect(h.queries.run(ReadCheckboxRangeQuery, range).count).toBe(4);
  h.commands.run(SetCheckboxesCommand, { ...range, checked: true });
  h.commands.run(ToggleCheckboxesCommand, range);
  expect(h.queries.run(ReadCheckboxRangeQuery, range).checked).toBe(0);
  h.map.set('1000000:0', { type: CheckboxCellType, value: true });
  h.commands.run(ToggleCheckboxesCommand, { anchor: [0, 0], focus: [1000000, 0] });
  expect(h.map.get('1000000:0')!.value).toBe(true);
  h.map.set('3:0', { type: 'string', value: ' false ' });
  h.commands.run(InsertCheckboxesCommand, { anchor: [3, 0], focus: [3, 0] });
  expect(h.map.get('3:0')).toEqual({ type: CheckboxCellType, value: false });
  h.map.set('4:0', { type: 'formula', formula: '=TRUE()' });
  expect(() => h.commands.run(InsertCheckboxesCommand, { anchor: [4, 0], focus: [4, 0] })).toThrow(CheckboxError);
  h.commands.run(InsertCheckboxesCommand, { anchor: [4, 0], focus: [4, 0], replaceExisting: true, checked: true });
  expect(h.map.get('4:0')!.value).toBe(true);
  expect(() => h.commands.run(InsertCheckboxesCommand, { anchor: [10, 0], focus: [1000000, 0] })).toThrow(
    CheckboxError,
  );
  expect(() => h.commands.run(SetCheckboxesCommand, { ...range, checked: 1 as never })).toThrow();
  expect(() => normalizeCheckboxRange({ anchor: [NaN, 0], focus: [1, 1] }, [4, 4])).toThrow();
  h.commands.run(RemoveCheckboxesCommand, { ...range, mode: CheckboxRemovalMode.Text });
  expect(h.map.get('0:0')!.type).toBe('string');
  h.commands.run(InsertCheckboxesCommand, range);
  h.commands.run(RemoveCheckboxesCommand, { ...range, mode: CheckboxRemovalMode.Clear });
  expect(h.map.has('0:0')).toBe(false);
  h.plugin.destroy();
  h.plugin.destroy();
  expect(h.dispose).toHaveBeenCalledTimes(1);
});
it('registers boolean formula conversion and default input validation, while deferring explicit checkbox rules', () => {
  const h = harness();
  h.map.set('0:0', { type: CheckboxCellType, value: false });
  expect(h.formulas.toFormulaValue(h.map.get('0:0')!)).toBe(false);
  expect(h.formulas.toFormulaValue({ type: CheckboxCellType, value: 'bad' })).toMatchObject({ kind: 'error' });
  expect(h.inputValidation.validate(0, 0, 'TRUE').reject).toBe(false);
  expect(h.inputValidation.validate(0, 0, '').reject).toBe(false);
  expect(h.inputValidation.validate(0, 0, 'bad').reject).toBe(true);
  h.setRule(true);
  expect(h.inputValidation.validate(0, 0, 'bad').reject).toBe(false);
  const strategy = new CheckboxCellCommitStrategy(() => true),
    context = { row: 0, col: 0, plainText: 'FALSE', richText: [], previous: null };
  expect(strategy.matches(context)).toBe(true);
  expect(strategy.commit(context)).toEqual({ type: CheckboxCellType, value: false });
  expect(strategy.commit({ ...context, plainText: 'TRUE' })?.value).toBe(true);
  expect(strategy.commit({ ...context, plainText: 'bad' })).toEqual({ type: 'string', value: 'bad' });
  expect(strategy.commit({ ...context, plainText: '' })).toBeNull();
  expect(new CheckboxCellCommitStrategy().matches(context)).toBe(false);
  expect(parseCheckboxText('1')).toBeNull();
  h.plugin.destroy();
});
it('serializes native checkbox copies and draws finite portable glyphs with clipping', () => {
  const definition = new CheckboxCellTypeDefinition(),
    codec = definition.createClipboardCodec();
  expect(codec.decode(codec.encode({ value: true }))).toEqual({ type: CheckboxCellType, value: true });
  expect(codec.decode({ value: 1 })).toBeNull();
  expect(codec.toPlainText({ value: false })).toBe('FALSE');
  expect(codec.toPlainText({})).toBe('');
  expect(definition.isStoredValue({ value: false })).toBe(true);
  expect(definition.isStoredValue({ value: 0 })).toBe(false);
  expect(definition.createDisplayTextProvider().getDisplayText({ value: true })).toBe('TRUE');
  expect(definition.createCommitStrategies()).toHaveLength(1);
  for (const value of [true, false]) {
    const cell = new CheckboxCell(
      { type: CheckboxCellType, value },
      { x: 50, y: 24, width: 100, height: 24 },
      { type: CheckboxCellType, value, startRowIndex: 0, startColIndex: 0 },
    );
    expect(cell.getDisplayText()).toBe(value ? 'TRUE' : 'FALSE');
    expect(cell.render()).toBeTruthy();
    const glyph = new CheckboxGlyphNode({ x: 92, y: 28, width: 16, height: 16 }, { type: CheckboxCellType, value }),
      context = new HeadlessRenderContext(),
      line = jest.spyOn(context, 'lineTo');
    glyph.drawScene(context);
    glyph.drawScene(context, new PositionRect(0, 0, 100, 100));
    glyph.drawScene(context, [
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
    if (value) expect(line).toHaveBeenCalled();
  }
  const tiny = new CheckboxCell(
    { type: CheckboxCellType, value: false },
    { x: 0, y: 0, width: 5, height: 5 },
    { type: CheckboxCellType },
  );
  expect(tiny.render()).toBeTruthy();
});
it('routes glyph pointer input through commands and does not intercept unrelated hits', () => {
  const h = harness();
  h.map.set('0:0', { type: CheckboxCellType, value: false });
  const event = {
    target: { properties: { semanticOwner: CheckboxCellType, startRowIndex: 0, startColIndex: 0 } },
    origin: { button: 0, preventDefault: jest.fn() },
  } as unknown as EventWithOffsetAndTarget<CellProperties>;
  const view = new SheetCheckboxView({
    commands: h.commands,
    cursor: new CursorRegistry(),
    coordinator: { registerCell: () => () => {}, registerStoredValueValidator: () => () => {} } as never,
    types: { registerRenderer: () => () => {} } as never,
    beforeToggle: () => true,
  });
  expect(view.onMouseDown(undefined, event)).toBe(false);
  expect(h.map.get('0:0')!.value).toBe(true);
  expect(view.onDblClick(undefined, event)).toBe(false);
  expect(view.onMouseDown(undefined, { ...event, target: null })).toBeUndefined();
  expect(h.plugin.apply()).toBeNull();
  expect(h.plugin.registerState().dataEngine.enabled).toBe(false);
  h.plugin.destroy();
});
