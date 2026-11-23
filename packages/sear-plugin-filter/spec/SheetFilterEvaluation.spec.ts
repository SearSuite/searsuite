import {
  SheetFilterCategory, SheetFilterColorProperty, SheetFilterKind, SheetFilterOperator,
  type SheetFilterPredicate,
} from '../src/SheetFilterTypes';
import { evaluateSheetFilter } from '../src/evaluateSheetFilter';
import { assertSheetFilterPredicate } from '../src/validateSheetFilterPredicate';

const platform = { toLowerCase: (value: string) => value.toLowerCase() };
const color = (value: string | null) => () => value;
const testValue = (predicate: SheetFilterPredicate, value: unknown, fill: string | null = null) =>
  evaluateSheetFilter(predicate, value, color(fill), platform);

describe('Sheet filter evaluation', () => {
  it('supports inclusion, exclusion and blank values', () => {
    const include: SheetFilterPredicate = { kind: SheetFilterKind.Values, values: ['Ada', ''] };
    const exclude: SheetFilterPredicate = { ...include, excluded: true };
    expect(testValue(include, 'Ada')).toBe(true);
    expect(testValue(include, null)).toBe(true);
    expect(testValue(include, 'Bob')).toBe(false);
    expect(testValue(exclude, 'Ada')).toBe(false);
    expect(testValue(exclude, 'Bob')).toBe(true);
  });

  it('matches text and fill colors without depending on exact casing', () => {
    const fill: SheetFilterPredicate = {
      kind: SheetFilterKind.Color, property: SheetFilterColorProperty.Fill, color: '#AABBCC',
    };
    expect(testValue(fill, 'Ada', '#aabbcc')).toBe(true);
    expect(testValue(fill, 'Ada', '#ffffff')).toBe(false);
    expect(testValue(fill, 'Ada')).toBe(false);
    expect(testValue({ ...fill, color: null }, 'Ada')).toBe(true);
    expect(testValue({ ...fill, color: null }, 'Ada', '#aabbcc')).toBe(false);
    expect(testValue({ ...fill, property: SheetFilterColorProperty.Text }, 'Ada', '#aabbcc')).toBe(true);
  });

  it.each([
    [SheetFilterOperator.Equal, 'ADA', true],
    [SheetFilterOperator.NotEqual, 'ada', false],
    [SheetFilterOperator.StartsWith, 'ad', true],
    [SheetFilterOperator.NotStartsWith, 'ad', false],
    [SheetFilterOperator.EndsWith, 'da', true],
    [SheetFilterOperator.NotEndsWith, 'da', false],
    [SheetFilterOperator.Contains, 'd', true],
    [SheetFilterOperator.NotContains, 'd', false],
  ])('evaluates text operator %s', (operator, value, expected) => {
    expect(testValue({ kind: SheetFilterKind.Condition, category: SheetFilterCategory.Text, operator, value }, 'Ada'))
      .toBe(expected);
  });

  it('BUG-851 matches Excel text wildcards for equality without changing literal values', () => {
    const equal: SheetFilterPredicate = {
      kind: SheetFilterKind.Condition, category: SheetFilterCategory.Text,
      operator: SheetFilterOperator.Equal, value: 'a?c',
    };
    expect(testValue(equal, 'abc')).toBe(true);
    expect(testValue(equal, 'axc')).toBe(true);
    expect(testValue(equal, 'ac')).toBe(false);
    expect(testValue({ ...equal, operator: SheetFilterOperator.NotEqual }, 'abc')).toBe(false);
    expect(testValue({ ...equal, value: 'a*c' }, 'a-long-c')).toBe(true);
    expect(testValue({ ...equal, value: 'a*c' }, 'ac')).toBe(true);
    expect(testValue({ ...equal, value: 'a~?c' }, 'a?c')).toBe(true);
    expect(testValue({ ...equal, value: 'a~?c' }, 'abc')).toBe(false);
    expect(testValue({ ...equal, value: 'abc' }, 'abc')).toBe(true);
    expect(testValue({ ...equal, value: 'abc' }, 'axc')).toBe(false);
  });

  it.each([
    [SheetFilterOperator.Equal, '10', true],
    [SheetFilterOperator.NotEqual, '10', false],
    [SheetFilterOperator.Greater, '9', true],
    [SheetFilterOperator.GreaterEqual, '10', true],
    [SheetFilterOperator.Less, '11', true],
    [SheetFilterOperator.LessEqual, '10', true],
    [SheetFilterOperator.Between, '9', true],
    [SheetFilterOperator.NotBetween, '11', true],
  ])('evaluates numeric operator %s', (operator, value, expected) => {
    expect(testValue({
      kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator, value, secondValue: operator === SheetFilterOperator.Between ? '11' : '9',
    }, 10)).toBe(expected);
  });

  it('interprets a percent condition as its numeric value', () => {
    const predicate: SheetFilterPredicate = {
      kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.Equal, value: '50%',
    };
    expect(testValue(predicate, 0.5)).toBe(true);
    expect(testValue(predicate, 1)).toBe(false);
    expect(testValue({ ...predicate, value: '0.5' }, 0.5)).toBe(true);
  });

  it('rejects blank, invalid and incomplete numeric conditions', () => {
    const equal: SheetFilterPredicate = {
      kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.Equal, value: '0',
    };
    expect(testValue(equal, '')).toBe(false);
    expect(testValue(equal, 'not a number')).toBe(false);
    expect(testValue({ ...equal, value: 'bad' }, 0)).toBe(false);
    expect(testValue({ ...equal, operator: SheetFilterOperator.Between }, 0)).toBe(false);
    expect(testValue({ ...equal, operator: SheetFilterOperator.NotBetween, secondValue: 'bad' }, 0)).toBe(false);
    expect(testValue({ ...equal, value: '10', operator: SheetFilterOperator.Greater }, '0x10')).toBe(false);
    expect(testValue({ ...equal, value: '10', operator: SheetFilterOperator.Greater }, 20)).toBe(true);
    expect(testValue({ ...equal, value: '1e1', operator: SheetFilterOperator.Greater }, '2e1')).toBe(true);
  });

  it('compares date serial values with an injected parser', () => {
    const predicate: SheetFilterPredicate = {
      kind: SheetFilterKind.Condition, category: SheetFilterCategory.Date,
      operator: SheetFilterOperator.Between, value: '2026-01-01', secondValue: '2026-01-31',
    };
    const parseDate = (value: unknown) => {
      if (value === 'invalid') return null;
      if (typeof value === 'number') return value;
      return Date.parse(String(value));
    };
    expect(evaluateSheetFilter(predicate, '2026-01-15', color(null), platform, parseDate)).toBe(true);
    expect(evaluateSheetFilter(predicate, '2026-02-01', color(null), platform, parseDate)).toBe(false);
    expect(evaluateSheetFilter(predicate, 'invalid', color(null), platform, parseDate)).toBe(false);
  });
});

describe('Sheet filter predicate validation', () => {
  it('accepts supported value, color and condition rules', () => {
    expect(() => assertSheetFilterPredicate({ kind: SheetFilterKind.Values, values: ['Ada'], excluded: true }))
      .not.toThrow();
    expect(() => assertSheetFilterPredicate({
      kind: SheetFilterKind.Color, property: SheetFilterColorProperty.Fill, color: null,
    })).not.toThrow();
    expect(() => assertSheetFilterPredicate({
      kind: SheetFilterKind.Condition, category: SheetFilterCategory.Date,
      operator: SheetFilterOperator.Between, value: '2026-01-01', secondValue: '2026-01-31',
    })).not.toThrow();
  });

  it.each([
    null,
    { kind: SheetFilterKind.Values, values: 'Ada' },
    { kind: SheetFilterKind.Values, values: [42] },
    { kind: SheetFilterKind.Values, values: [], excluded: 'yes' },
    { kind: SheetFilterKind.Color, property: 'unknown', color: '#ffffff' },
    { kind: SheetFilterKind.Color, property: SheetFilterColorProperty.Fill, color: '' },
    { kind: SheetFilterKind.Condition, category: 'unknown', operator: SheetFilterOperator.Equal, value: '1' },
    { kind: SheetFilterKind.Condition, category: SheetFilterCategory.Text,
      operator: SheetFilterOperator.Greater, value: 'Ada' },
    { kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.Equal, value: 10 },
    { kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.Between, value: '1' },
    { kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.Greater, value: 'abc' },
    { kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.Greater, value: 'Infinity' },
    { kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.Greater, value: '0x10' },
    { kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.Between, value: '1', secondValue: 'abc' },
    { kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.Between, value: '10', secondValue: '2' },
    { kind: SheetFilterKind.Condition, category: SheetFilterCategory.Number,
      operator: SheetFilterOperator.NotBetween, value: '10', secondValue: '2' },
    { kind: 'unknown' },
  ])('rejects malformed filter rules', (predicate) => {
    expect(() => assertSheetFilterPredicate(predicate as SheetFilterPredicate)).toThrow();
  });
});
