import { SearError } from '@searsuite/sear-foundation-error';
import {
  SheetFilterCategory, SheetFilterColorProperty, SheetFilterKind, SheetFilterOperator,
  type SheetFilterPredicate,
} from './SheetFilterTypes';
import { parseSheetFilterNumber } from './parseSheetFilterNumber';

const numericOperators: readonly SheetFilterOperator[] = [
  SheetFilterOperator.Equal, SheetFilterOperator.NotEqual, SheetFilterOperator.Greater,
  SheetFilterOperator.GreaterEqual, SheetFilterOperator.Less, SheetFilterOperator.LessEqual,
  SheetFilterOperator.Between, SheetFilterOperator.NotBetween,
];
const textOperators: readonly SheetFilterOperator[] = [
  SheetFilterOperator.Equal, SheetFilterOperator.NotEqual, SheetFilterOperator.StartsWith,
  SheetFilterOperator.NotStartsWith, SheetFilterOperator.EndsWith, SheetFilterOperator.NotEndsWith,
  SheetFilterOperator.Contains, SheetFilterOperator.NotContains,
];
const dateOperators: readonly SheetFilterOperator[] = [
  SheetFilterOperator.Equal, SheetFilterOperator.Less, SheetFilterOperator.Greater,
  SheetFilterOperator.Between,
];

/** Rejects malformed persisted or command-supplied conditions before they change row visibility. */
export function assertSheetFilterPredicate(predicate: SheetFilterPredicate): void {
  if (!predicate || typeof predicate !== 'object') throw new SearError('Filter predicate must be an object.');
  if (predicate.kind === SheetFilterKind.Values) {
    if (!Array.isArray(predicate.values) || !predicate.values.every((value) => typeof value === 'string') ||
      (predicate.excluded !== undefined && typeof predicate.excluded !== 'boolean'))
      throw new SearError('Value filter requires string values.');
    return;
  }
  if (predicate.kind === SheetFilterKind.Color) {
    if (!Object.values(SheetFilterColorProperty).includes(predicate.property) ||
      (predicate.color !== null && (typeof predicate.color !== 'string' || !predicate.color)))
      throw new SearError('Color filter has an invalid property or color.');
    return;
  }
  if (predicate.kind === SheetFilterKind.Condition) {
    const operators = predicate.category === SheetFilterCategory.Number ? numericOperators
      : predicate.category === SheetFilterCategory.Text ? textOperators
      : predicate.category === SheetFilterCategory.Date ? dateOperators : null;
    if (!operators?.includes(predicate.operator) || typeof predicate.value !== 'string')
      throw new SearError('Filter condition has an invalid category, operator, or value.');
    if ((predicate.operator === SheetFilterOperator.Between || predicate.operator === SheetFilterOperator.NotBetween) &&
      typeof predicate.secondValue !== 'string')
      throw new SearError('Between filter requires a second value.');
    if (predicate.category === SheetFilterCategory.Number) {
      const lower = parseSheetFilterNumber(predicate.value);
      const interval = predicate.operator === SheetFilterOperator.Between ||
        predicate.operator === SheetFilterOperator.NotBetween;
      const upper = interval ? parseSheetFilterNumber(predicate.secondValue) : null;
      if (lower === null || (interval && upper === null))
        throw new SearError('Numeric filter requires finite numeric values.');
      if (upper !== null && lower > upper)
        throw new SearError('Numeric filter lower bound cannot exceed upper bound.');
    }
    return;
  }
  throw new SearError('Unknown filter predicate kind.');
}
