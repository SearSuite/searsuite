/** Persisted filter modes owned by this plugin. */
export const SheetFilterKind = {
  Values: 'values',
  Condition: 'condition',
  Color: 'color',
} as const;
/** Supported filter rule kinds. */
export type SheetFilterKind = (typeof SheetFilterKind)[keyof typeof SheetFilterKind];

/** Value categories supported by condition filters. */
export const SheetFilterCategory = {
  Number: 'number', Text: 'text', Date: 'date',
} as const;
/** A condition filter's value category. */
export type SheetFilterCategory = (typeof SheetFilterCategory)[keyof typeof SheetFilterCategory];

/** Operators available to condition filters. */
export const SheetFilterOperator = {
  Equal: 'equal', NotEqual: 'notEqual', Greater: 'greater', GreaterEqual: 'greaterEqual',
  Less: 'less', LessEqual: 'lessEqual', Between: 'between', NotBetween: 'notBetween',
  StartsWith: 'startsWith', NotStartsWith: 'notStartsWith', EndsWith: 'endsWith',
  NotEndsWith: 'notEndsWith', Contains: 'contains', NotContains: 'notContains',
} as const;
/** A comparison operator supported by the filter plugin. */
export type SheetFilterOperator = (typeof SheetFilterOperator)[keyof typeof SheetFilterOperator];

/** Cell visual properties available to color filters. */
export const SheetFilterColorProperty = { Fill: 'fill', Text: 'textColor' } as const;
/** A cell visual property used by a color filter. */
export type SheetFilterColorProperty = (typeof SheetFilterColorProperty)[keyof typeof SheetFilterColorProperty];

/** Serializable rule used to decide whether a row remains visible. */
export type SheetFilterPredicate =
  | { readonly kind: typeof SheetFilterKind.Values; readonly values: readonly string[]; readonly excluded?: boolean }
  | { readonly kind: typeof SheetFilterKind.Condition; readonly category: SheetFilterCategory;
      readonly operator: SheetFilterOperator; readonly value: string; readonly secondValue?: string }
  | { readonly kind: typeof SheetFilterKind.Color; readonly property: SheetFilterColorProperty;
      readonly color: string | null };

/** A rule attached to one column within a filter range. */
export interface SheetFilterColumnRule {
  /** Zero-based sheet column index. */
  readonly column: number;
  /** Predicate applied to values in the column. */
  readonly predicate: SheetFilterPredicate;
}

/** Document or private-session filter configuration for one sheet range. */
export interface SheetFilterDefinition {
  /** Inclusive sheet coordinates covered by the filter. */
  readonly range: { readonly start: readonly [number, number]; readonly end: readonly [number, number] };
  /** Active column predicates. */
  readonly rules: readonly SheetFilterColumnRule[];
  /** Whether the first row is always visible as a header. */
  readonly firstRowIsHeader: boolean;
  /** Whether this definition belongs to the current editor session. */
  readonly privateView: boolean;
}

/** One distinct displayed value and its occurrence count. */
export interface SheetFilterValueCount {
  readonly value: string;
  /** Formatted text shown to the user; value remains the predicate key. */
  readonly label?: string;
  readonly count: number;
  /** True when every cell represented by this value is a boolean. */
  readonly isBoolean?: true;
}
/** Bounded distinct-value query result for a filter column. */
export interface SheetFilterValuePage {
  /** Matching values returned within the requested limit. */
  readonly items: readonly SheetFilterValueCount[];
  /** Whether additional matching values were omitted. */
  readonly truncated: boolean;
}

/** Uses display values for distinct-value selection, including an explicit blank key. */
export function sheetFilterValueKey(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}
