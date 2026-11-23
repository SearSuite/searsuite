import { type FormulaValue } from '@searsuite/sear-domain-formula-engine';

/** A deterministic compatibility case reviewed against spreadsheet semantics. */
export interface FormulaSemanticCase {
  readonly id: string;
  readonly category: 'coercion' | 'error' | 'array' | 'workbook' | 'date-time';
  readonly formula: string;
  readonly cells?: Readonly<Record<string, FormulaValue>>;
  readonly workbookCells?: Readonly<Record<string, FormulaValue>>;
  readonly shape?: readonly [number, number];
  readonly dateTimeLocale?: 'chinese';
  readonly currentDateTime?: number;
  readonly expected: FormulaValue;
  readonly oracle: 'excel-compatible' | 'google-compatible' | 'engine-contract';
  readonly oracleVersion: string;
  /** Short note describing the compatibility rule covered by the case. */
  readonly rule: string;
}

/**
 * High-risk spreadsheet semantics kept separate from the broad function catalog.
 *
 * These are intentionally small and deterministic. A case should be added here
 * when a regression would change Excel/Sheets-compatible behavior, not merely
 * when a new function receives its first happy-path example.
 */
export const formulaSemanticCases: readonly FormulaSemanticCase[] = [
  {
    id: 'sum-mixed-range-values',
    category: 'coercion',
    formula: '=SUM(A1:A4)',
    cells: { '0,0': '2', '1,0': true, '2,0': false, '3,0': 'text' },
    shape: [4, 1],
    expected: 0,
    oracle: 'excel-compatible',
    oracleVersion: 'offline-v1',
    rule: 'Range aggregation ignores referenced text and booleans.',
  },
  {
    id: 'lazy-if-branch',
    category: 'error',
    formula: '=IF(A1>0,A1,1/0)',
    cells: { '0,0': 7 },
    expected: 7,
    oracle: 'excel-compatible',
    oracleVersion: 'offline-v1',
    rule: 'Lazy branches do not evaluate an unselected error-producing expression.',
  },
  {
    id: 'error-recovery',
    category: 'error',
    formula: '=IFERROR(1/0,"fallback")',
    expected: 'fallback',
    oracle: 'excel-compatible',
    oracleVersion: 'offline-v1',
    rule: 'IFERROR converts a formula error to its fallback value.',
  },
  {
    id: 'explicit-error-propagation',
    category: 'error',
    formula: '=A1+1',
    cells: { '0,0': { kind: 'error', code: '#N/A' } },
    expected: { kind: 'error', code: '#N/A' },
    oracle: 'engine-contract',
    oracleVersion: 'error-codes-v1',
    rule: 'An operand error is preserved instead of being coerced or replaced.',
  },
  {
    id: 'dynamic-array-sequence',
    category: 'array',
    formula: '=SEQUENCE(2,3,1,1)',
    expected: [
      [1, 2, 3],
      [4, 5, 6],
    ],
    oracle: 'excel-compatible',
    oracleVersion: 'offline-v1',
    rule: 'Dynamic-array functions preserve row-major rectangular shape.',
  },
  {
    id: 'dynamic-array-filter',
    category: 'array',
    formula: '=FILTER({1;2;3},{TRUE;FALSE;TRUE})',
    expected: [[1], [3]],
    oracle: 'excel-compatible',
    oracleVersion: 'offline-v1',
    rule: 'Filtering keeps matching rows and returns a rectangular spill result.',
  },
  {
    id: 'array-error-propagation',
    category: 'array',
    formula: '=SUM({1,1/0,3})',
    expected: { kind: 'error', code: '#DIV/0!' },
    oracle: 'engine-contract',
    oracleVersion: 'error-codes-v1',
    rule: 'An error inside an array argument propagates through aggregation.',
  },
  {
    id: 'cross-sheet-range',
    category: 'workbook',
    formula: "=SUM('Sales Data'!A1:B2)",
    workbookCells: {
      'Sales Data:0,0': 1,
      'Sales Data:0,1': 2,
      'Sales Data:1,0': 3,
      'Sales Data:1,1': 4,
    },
    shape: [2, 2],
    expected: 10,
    oracle: 'excel-compatible',
    oracleVersion: 'offline-v1',
    rule: 'Workbook-qualified ranges are read through the host workbook projection.',
  },
  {
    id: 'chinese-date-locale',
    category: 'date-time',
    formula: '=DATEVALUE("2021 年 12 月 31 日")',
    dateTimeLocale: 'chinese',
    expected: 44561,
    oracle: 'excel-compatible',
    oracleVersion: 'offline-v1',
    rule: 'Date parsing uses the injected locale while retaining Excel serial values.',
  },
  {
    id: 'deterministic-today',
    category: 'date-time',
    formula: '=TODAY()',
    currentDateTime: Date.UTC(2011, 11, 1, 6),
    expected: 40878,
    oracle: 'excel-compatible',
    oracleVersion: 'offline-v1',
    rule: 'Volatile date functions use the host-provided wall-clock source.',
  },
];
