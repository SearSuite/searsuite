import { type FormulaValue } from '@searsuite/sear-domain-formula-engine';

export interface ExcelGoldenCase {
  readonly name: string;
  readonly formula: string;
  readonly shape: [number, number];
  readonly cells: Record<string, FormulaValue>;
  readonly expected: FormulaValue;
}

/**
 * Offline contract cases. Keeping them in source makes CI deterministic and
 * avoids requiring a desktop-office installation in every test environment.
 * Each new or changed case must record its LibreOffice Calc or Excel source
 * and version after manual compatibility review.
 */
export const excelGoldenCases: readonly ExcelGoldenCase[] = [
  {
    name: 'operator precedence',
    formula: '=1+2*3',
    shape: [1, 1],
    cells: {},
    expected: 7,
  },
  {
    name: 'referenced numeric text and boolean in SUM',
    formula: '=SUM(A1:A3)',
    shape: [3, 1],
    cells: { '0,0': '2', '1,0': 3, '2,0': true },
    expected: 3,
  },
  {
    name: 'ordinary text ignored by SUM',
    formula: '=SUM(A1:A3)',
    shape: [3, 1],
    cells: { '0,0': 2, '1,0': 'text', '2,0': 3 },
    expected: 5,
  },
  {
    name: 'whole-column SUM',
    formula: '=SUM(A:A)',
    shape: [3, 1],
    cells: { '0,0': 2, '1,0': -1, '2,0': 4 },
    expected: 5,
  },
  {
    name: 'comparison',
    formula: '=A1>=10',
    shape: [1, 1],
    cells: { '0,0': 10 },
    expected: true,
  },
  {
    name: 'concatenation',
    formula: '="Total: "&SUM(A1:A2)',
    shape: [2, 1],
    cells: { '0,0': 2, '1,0': 3 },
    expected: 'Total: 5',
  },
];
