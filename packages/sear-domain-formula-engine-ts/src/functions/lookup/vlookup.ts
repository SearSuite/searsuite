/**
 * VLOOKUP: Searches the first column of a table and returns a value from a selected column.
 * Example: =VLOOKUP(2,{1,"A";2,"B"},2,FALSE) returns "B".
 */
import {
  type FormulaFunction,
  type FormulaArg,
  type FormulaValue,
  type EvalContext,
  FormulaErrorCode,
  createFormulaError,
  FormulaNodeKind,
  FormulaRangeSourceKind,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { formulaRangeWidth, readArg, readFormulaRangeCell, resolveFormulaRange } from '../shared/helpers';
import { isBlankScalarInput } from '../shared/blankScalarInput';
import { mapLookupTargets, matrixArg, matchesExactLookup, matchesLookupWildcard, sameLookupType } from './lookupHelpers';

export const VLOOKUP: FormulaFunction = {
  name: 'VLOOKUP',
  descriptor: {
    version: 1,
    category: 'Lookup',
    summary: 'Finds a value in the first column and returns a value from the same row.',
    example: '=VLOOKUP(A1,B1:D10,2,FALSE)',
    parameters: [
      { name: 'lookup_value', description: 'Value to find.' },
      { name: 'table_array', description: 'Range containing the lookup column.' },
      { name: 'col_index_num', description: 'One-based result column in the range.' },
      { name: 'range_lookup', description: 'TRUE for approximate match; FALSE for exact match.', optional: true },
    ],
  },
  evaluate(args: FormulaArg[], context: EvalContext): FormulaValue {
    if (args.length < 3 || args.length > 4) return createFormulaError(FormulaErrorCode.Value);
    if (isBlankScalarInput(args[0], context)) return createFormulaError(FormulaErrorCode.NotAvailable);
    const table = resolveFormulaRange(args[1], context);
    if (table && 'kind' in table) return table;
    if (table && (table.startRow > table.endRow || table.startCol > table.endCol))
      return createFormulaError(FormulaErrorCode.Value);
    if (
      table?.source.kind === FormulaRangeSourceKind.CurrentSheet &&
      (!context.isCellInBounds(table.startRow, table.startCol) || !context.isCellInBounds(table.endRow, table.endCol))
    )
      return createFormulaError(FormulaErrorCode.Reference);
    const tableValue = table ? null : matrixArg(args[1], context);
    const matrix = isFormulaError(tableValue) ? [[tableValue]] : tableValue;
    const rowCount = table ? table.endRow - table.startRow + 1 : matrix?.length ?? 0;
    const width = table ? formulaRangeWidth(table) : matrix?.[0]?.length ?? 0;
    if (
      !table &&
      rowCount === 1 &&
      width === 1 &&
      typeof matrix?.[0]?.[0] === 'string' &&
      isFormulaError(toNumberOrError(matrix[0][0]))
    )
      return createFormulaError(FormulaErrorCode.Value);
    const indexValue = readArg(args[2], context);
    if (
      args[2]?.kind === 'value' &&
      args[2].sourceKind === FormulaNodeKind.String &&
      !isFormulaError(indexValue) &&
      !Array.isArray(indexValue) &&
      isFormulaError(toNumberOrError(indexValue))
    )
      return createFormulaError(FormulaErrorCode.Value);
    let approximate = true;
    if (args[3] !== undefined) {
      const mode = readArg(args[3], context);
      if (isFormulaError(mode) || Array.isArray(mode))
        return isFormulaError(mode) ? mode : createFormulaError(FormulaErrorCode.Value);
      if (typeof mode === 'boolean') approximate = mode;
      else {
        const text = isFormulaText(mode) ? mode.value : typeof mode === 'string' ? mode : null;
        if (text !== null && /^(true|false)$/i.test(text.trim())) {
          approximate = /^true$/i.test(text.trim());
        } else {
          const numericMode = toNumberOrError(mode);
          if (isFormulaError(numericMode)) return numericMode;
          approximate = numericMode !== 0;
        }
      }
    }
    return mapLookupTargets(args[0], context, (lookup) => {
      let matchedRow = -1;
      if (approximate && table && typeof lookup === 'number' && context.metadata) {
        let low = 0;
        let high = rowCount - 1;
        while (low <= high) {
          const row = Math.floor((low + high) / 2);
          const address = { row: table.startRow + row, col: table.startCol };
          const metadata = context.metadata.readCell({
            ...address,
            ...(table.source.kind === FormulaRangeSourceKind.WorkbookSheet
              ? { sheetName: table.source.sheetName }
              : {}),
          });
          const candidate = readFormulaRangeCell(table, address.row, address.col, context);
          if (metadata?.source === 'empty' || isFormulaError(candidate) || !sameLookupType(candidate, lookup)) {
            high = row - 1;
            continue;
          }
          const comparison = compare(candidate, lookup);
          if (comparison <= 0) {
            matchedRow = row;
            low = row + 1;
          } else {
            high = row - 1;
          }
        }
      } else {
        for (let row = 0; row < rowCount; row++) {
          const candidate = table
            ? readFormulaRangeCell(table, table.startRow + row, table.startCol, context)
            : matrix?.[row]?.[0];
          if (candidate === undefined || isFormulaError(candidate)) continue;
          if (!sameLookupType(candidate, lookup)) continue;
          if (!approximate) {
            if (matchesLookupWildcard(candidate, lookup) || matchesExactLookup(candidate, lookup)) {
              matchedRow = row;
              break;
            }
            continue;
          }
          const comparison = compare(candidate, lookup);
          if (comparison === 0) {
            matchedRow = row;
            if (!approximate) break;
            continue;
          }
          if (approximate && comparison < 0) matchedRow = row;
          if (approximate && comparison > 0) break;
        }
      }
      if (matchedRow < 0) return createFormulaError(FormulaErrorCode.NotAvailable);
      if (isFormulaError(indexValue) || Array.isArray(indexValue))
        return isFormulaError(indexValue)
          ? createFormulaError(FormulaErrorCode.Reference)
          : createFormulaError(FormulaErrorCode.Value);
      const rawIndex = toNumberOrError(indexValue);
      if (isFormulaError(rawIndex)) return createFormulaError(FormulaErrorCode.Value);
      const index = Math.trunc(rawIndex);
      if (index <= 0) return createFormulaError(FormulaErrorCode.Value);
      if (index > width) return createFormulaError(FormulaErrorCode.Reference);
      return table
        ? readFormulaRangeCell(table, table.startRow + matchedRow, table.startCol + index - 1, context)
        : matrix?.[matchedRow]?.[index - 1] ?? 0;
    });
  },
};

function compare(left: FormulaValue, right: FormulaValue): number {
  const leftNumber = toNumberOrError(left);
  const rightNumber = toNumberOrError(right);
  if (!isFormulaError(leftNumber) && !isFormulaError(rightNumber)) return leftNumber - rightNumber;
  const leftText = String(typeof left === 'object' && left && 'value' in left ? left.value : left).toLowerCase();
  const rightText = String(typeof right === 'object' && right && 'value' in right ? right.value : right).toLowerCase();
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}
