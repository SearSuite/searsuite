import { SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
import {
  ReadDataValidationCellRulesQuery,
  DataValidationKind,
  DataValidationInputPolicy,
  DataValidationDropdownMode,
  type DataValidationRule,
  parseDropdownSelection,
  formatDropdownSelection,
  evaluateDataValidation,
} from '@searsuite/sear-plugin-data-validation';
import {
  readDropdownCell,
  assertDropdownCell,
  planDropdownValue,
  DropdownError,
  DropdownLimits,
  type SheetDropdownOptions,
} from '../src';
function fixture() {
  const queries = new SheetQueryRegistry();
  let source: unknown[] = ['x', 'x', null, 'y'];
  let text = '';
  const rule: {
    id: string;
    endRow: number;
    endColumn: number;
    inputPolicy: DataValidationRule['inputPolicy'];
    condition: DataValidationRule['condition'];
  } = {
    id: 'r',
    endRow: 9,
    endColumn: 1,
    inputPolicy: DataValidationInputPolicy.Reject,
    condition: {
      kind: DataValidationKind.Dropdown,
      options: [{ label: 'x' }, { label: 'y' }],
      dropdownMode: DataValidationDropdownMode.Multiple,
    },
  };
  queries.register(ReadDataValidationCellRulesQuery, () => [{ row: 0, column: 0, rule }]);
  const options: SheetDropdownOptions = {
    queries,
    validation: new SheetCellInputValidationRegistry(),
    readShape: () => [10, 10],
    readText: () => text,
    forEachSourceValue: (_start, _end, visit) => source.forEach((value) => {
      if (value !== null && value !== undefined) visit(typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value), value);
    }),
    createValueTransaction: () => {
      throw 'unused';
    },
  };
  return {
    options,
    rule,
    setText: (value: string) => {
      text = value;
    },
    setSource: (value: unknown[]) => {
      source = value;
    },
  };
}
it('roundtrips punctuation, quotes and spaces without accepting malformed CSV prefixes', () => {
  const values = ['A,B', 'say "yes"', ' x ', 'ordinary'];
  expect(parseDropdownSelection(formatDropdownSelection(values))).toEqual(values);
  expect(parseDropdownSelection('A, B')).toEqual(['A', 'B']);
  expect(parseDropdownSelection('"A"oops')).toEqual(['"A"oops']);
  expect(parseDropdownSelection('"unterminated')).toEqual(['"unterminated']);
  expect(parseDropdownSelection('A,')).toEqual(['A', '']);
  expect(parseDropdownSelection('')).toEqual([]);
  expect(
    evaluateDataValidation(
      {
        kind: DataValidationKind.Dropdown,
        dropdownMode: DataValidationDropdownMode.Multiple,
        options: values.map((label) => ({ label })),
      },
      formatDropdownSelection(values),
      { row: 0, column: 0 },
    ),
  ).toBe(true);
});
it('BUG-456 keeps a comma label selected and serializes it when another choice is picked', () => {
  const f = fixture();
  f.rule.condition = { kind: DataValidationKind.Dropdown,
    dropdownMode: DataValidationDropdownMode.Multiple,
    options: [{ label: 'A,B' }, { label: 'C' }] };
  f.setText('A,B');
  const cell = { row: 0, column: 0 };
  const state = readDropdownCell(cell, f.options)!;
  expect(state.selected).toEqual(['A,B']);
  const next = planDropdownValue(state, { ...cell, label: 'C' });
  expect(next).toBe('"A,B", C');
  expect(evaluateDataValidation(f.rule.condition, String(next), { row: 0, column: 0 })).toBe(true);
});
it('validates coordinates and plans single, mixed, removed and stale choices', () => {
  const f = fixture();
  for (const input of [
    { row: -1, column: 0 },
    { row: 10, column: 0 },
    { row: 0.1, column: 0 },
  ])
    expect(() => assertDropdownCell(input, [10, 10])).toThrow(DropdownError);
  const cell = { row: 0, column: 0 };
  f.setText('x, missing');
  let state = readDropdownCell(cell, f.options)!;
  expect(planDropdownValue(state, { ...cell, label: 'y' })).toBe('x, y');
  expect(planDropdownValue(state, { ...cell, label: 'x' })).toBeNull();
  expect(() => planDropdownValue(null, { ...cell, label: 'x' })).toThrow(DropdownError);
  expect(() => planDropdownValue(state, { ...cell, label: 'x', ruleId: 'old' })).toThrow(DropdownError);
  expect(() => planDropdownValue(state, { ...cell, label: 'z' })).toThrow(DropdownError);
  f.rule.condition = { ...f.rule.condition, dropdownMode: DataValidationDropdownMode.Single };
  state = readDropdownCell(cell, f.options)!;
  expect(planDropdownValue(state, { ...cell, label: 'y' })).toBe('y');
});
it('deduplicates live sources and fails explicit budgets without partial output', () => {
  const f = fixture();
  f.rule.condition = { kind: DataValidationKind.Dropdown, sourceRange: { start: [0, 0], end: [9, 1] } } as never;
  expect(readDropdownCell({ row: 0, column: 0 }, f.options)!.options).toEqual([{ label: 'x' }, { label: 'y' }]);
  f.setSource(Array.from({ length: DropdownLimits.Options + 1 }, (_, i) => String(i)));
  expect(() => readDropdownCell({ row: 0, column: 0 }, f.options)).toThrow(DropdownError);
  f.setSource(Array(DropdownLimits.SourceValues + 1).fill('x'));
  expect(() => readDropdownCell({ row: 0, column: 0 }, f.options)).toThrow(DropdownError);
});
it('preserves unformatted numeric and boolean source values only for single selection', () => {
  const f = fixture();
  f.rule.condition = { kind: DataValidationKind.Dropdown, sourceRange: { start: [0, 0], end: [9, 1] } } as never;
  f.setSource([25, true, false]);
  const cell = { row: 0, column: 0 };
  const state = readDropdownCell(cell, f.options)!;
  expect(state.options).toEqual([
    { label: '25', value: 25 },
    { label: 'TRUE', value: true },
    { label: 'FALSE', value: false },
  ]);
  expect(planDropdownValue(state, { ...cell, label: '25' })).toBe(25);
  expect(planDropdownValue(state, { ...cell, label: 'FALSE' })).toBe(false);
  f.rule.condition = { ...f.rule.condition, dropdownMode: DataValidationDropdownMode.Multiple };
  expect(planDropdownValue(readDropdownCell(cell, f.options), { ...cell, label: '25' })).toBe('25');
});
