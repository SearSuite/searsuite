import { WorkbookError } from './WorkbookError';
import { WorkbookErrorCode } from './WorkbookErrorCode';
import {
  WorkbookCoordinateAxis,
  WorkbookCoordinateIndex,
  WorkbookReferenceField,
  type WorkbookReferenceDiagnosticField,
} from './WorkbookReferenceFields';
import {
  type WorkbookCellKey,
  type WorkbookCellReference,
  type WorkbookColumnRangeReference,
  type WorkbookFormulaReference,
  type WorkbookRangeReference,
  type WorkbookRowRangeReference,
  type ParsedWorkbookFormulaReference,
  type WorkbookSheetDescriptor,
} from './WorkbookTypes';

/** Creates a stable string key for a workbook-qualified cell reference. */
export function createWorkbookCellKey(reference: WorkbookCellReference): WorkbookCellKey {
  assertCellReference(reference);
  return JSON.stringify([
    reference[WorkbookReferenceField.sheetId],
    reference[WorkbookReferenceField.row],
    reference[WorkbookReferenceField.col],
  ]);
}

/** Parses a string produced by `createWorkbookCellKey` back into a cell reference. */
export function parseWorkbookCellKey(key: WorkbookCellKey): WorkbookCellReference {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch (cause) {
    throw new WorkbookError(WorkbookErrorCode.invalidCellKey, `Invalid workbook cell key: ${key}`, { key, cause });
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new WorkbookError(WorkbookErrorCode.invalidCellKey, `Invalid workbook cell key: ${key}`, { key });
  }
  const [sheetId, row, col] = parsed;
  const reference = {
    [WorkbookReferenceField.sheetId]: sheetId,
    [WorkbookReferenceField.row]: row,
    [WorkbookReferenceField.col]: col,
  };
  assertCellReference(reference);
  return reference as WorkbookCellReference;
}

/** Normalizes a range reference so start is top-left and end is bottom-right. */
export function normalizeWorkbookRangeReference(reference: WorkbookRangeReference): WorkbookRangeReference {
  assertRangeReference(reference);
  const start = reference[WorkbookReferenceField.start];
  const end = reference[WorkbookReferenceField.end];
  const rowIndex = WorkbookCoordinateIndex[WorkbookCoordinateAxis.row];
  const colIndex = WorkbookCoordinateIndex[WorkbookCoordinateAxis.col];
  const startRow = Math.min(start[rowIndex], end[rowIndex]);
  const endRow = Math.max(start[rowIndex], end[rowIndex]);
  const startCol = Math.min(start[colIndex], end[colIndex]);
  const endCol = Math.max(start[colIndex], end[colIndex]);
  return {
    [WorkbookReferenceField.sheetId]: reference[WorkbookReferenceField.sheetId],
    [WorkbookReferenceField.start]: [startRow, startCol],
    [WorkbookReferenceField.end]: [endRow, endCol],
  };
}

/** Normalizes a whole-column reference so the start column is before the end column. */
export function normalizeWorkbookColumnRangeReference(
  reference: WorkbookColumnRangeReference,
): WorkbookColumnRangeReference {
  assertColumnRangeReference(reference);
  return {
    [WorkbookReferenceField.sheetId]: reference[WorkbookReferenceField.sheetId],
    [WorkbookReferenceField.startCol]: Math.min(
      reference[WorkbookReferenceField.startCol],
      reference[WorkbookReferenceField.endCol],
    ),
    [WorkbookReferenceField.endCol]: Math.max(
      reference[WorkbookReferenceField.startCol],
      reference[WorkbookReferenceField.endCol],
    ),
  };
}

/** Normalizes a whole-row reference so the start row is before the end row. */
export function normalizeWorkbookRowRangeReference(reference: WorkbookRowRangeReference): WorkbookRowRangeReference {
  assertRowRangeReference(reference);
  return {
    [WorkbookReferenceField.sheetId]: reference[WorkbookReferenceField.sheetId],
    [WorkbookReferenceField.startRow]: Math.min(
      reference[WorkbookReferenceField.startRow],
      reference[WorkbookReferenceField.endRow],
    ),
    [WorkbookReferenceField.endRow]: Math.max(
      reference[WorkbookReferenceField.startRow],
      reference[WorkbookReferenceField.endRow],
    ),
  };
}

/** Returns a formula-safe display name for a workbook sheet. */
export function quoteWorkbookSheetName(name: string): string {
  const normalized = name.trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) return normalized;
  return `'${normalized.replace(/'/g, "''")}'`;
}

/** Formats a workbook-qualified cell reference using a caller-provided sheet name. */
export function formatWorkbookCellReference(reference: WorkbookCellReference, sheetName: string): string {
  assertCellReference(reference);
  return `${quoteWorkbookSheetName(sheetName)}!${formatA1Cell(
    reference[WorkbookReferenceField.row],
    reference[WorkbookReferenceField.col],
  )}`;
}

/** Formats a workbook-qualified rectangular range reference using a caller-provided sheet name. */
export function formatWorkbookRangeReference(reference: WorkbookRangeReference, sheetName: string): string {
  const normalized = normalizeWorkbookRangeReference(reference);
  const [startRow, startCol] = normalized[WorkbookReferenceField.start];
  const [endRow, endCol] = normalized[WorkbookReferenceField.end];
  const start = formatA1Cell(startRow, startCol);
  const end = formatA1Cell(endRow, endCol);
  const prefix = `${quoteWorkbookSheetName(sheetName)}!`;
  return start === end ? `${prefix}${start}` : `${prefix}${start}:${end}`;
}

/** Parses a displayed workbook reference such as Sheet2!A1 or Sheet2!A1:B5 into a stable sheet-id range. */
export function parseWorkbookFormulaReference(
  reference: string,
  sheets: readonly WorkbookSheetDescriptor[],
): ParsedWorkbookFormulaReference {
  const parsed = parseDisplayedWorkbookRangeReference(reference);
  const sheet = sheets.find((candidate) => candidate.name === parsed.sheetName);
  if (!sheet) {
    throw new WorkbookError(WorkbookErrorCode.sheetNotFound, `Workbook sheet not found: ${parsed.sheetName}`, {
      reference,
      sheetName: parsed.sheetName,
    });
  }
  return {
    [WorkbookReferenceField.sheetId]: sheet.id,
    range: normalizeWorkbookRangeReference({
      [WorkbookReferenceField.sheetId]: sheet.id,
      [WorkbookReferenceField.start]: parsed.start,
      [WorkbookReferenceField.end]: parsed.end,
    }),
  };
}

/** Formats a parsed workbook formula reference with the current user-facing sheet name. */
export function formatParsedWorkbookFormulaReference(
  reference: ParsedWorkbookFormulaReference,
  sheets: readonly WorkbookSheetDescriptor[],
): string {
  const sheet = sheets.find((candidate) => candidate.id === reference[WorkbookReferenceField.sheetId]);
  if (!sheet) {
    throw new WorkbookError(
      WorkbookErrorCode.sheetNotFound,
      `Workbook sheet not found: ${reference[WorkbookReferenceField.sheetId]}`,
      { reference },
    );
  }
  const normalized = normalizeWorkbookRangeReference(reference.range);
  return formatWorkbookRangeReference(normalized, sheet.name);
}

/** Reports whether an unknown value is a valid workbook-qualified cell reference. */
export function isWorkbookCellReference(reference: unknown): reference is WorkbookCellReference {
  if (!isRecord(reference)) return false;
  return (
    hasSheetId(reference) &&
    hasNonNegativeInteger(reference, WorkbookReferenceField.row) &&
    hasNonNegativeInteger(reference, WorkbookReferenceField.col)
  );
}

/** Reports whether an unknown value is a valid workbook-qualified rectangular range reference. */
export function isWorkbookRangeReference(reference: unknown): reference is WorkbookRangeReference {
  if (!isRecord(reference)) return false;
  return (
    hasSheetId(reference) &&
    hasCoordinate(reference, WorkbookReferenceField.start) &&
    hasCoordinate(reference, WorkbookReferenceField.end)
  );
}

/** Reports whether an unknown value is a valid workbook-qualified whole-column range reference. */
export function isWorkbookColumnRangeReference(reference: unknown): reference is WorkbookColumnRangeReference {
  if (!isRecord(reference)) return false;
  return (
    hasSheetId(reference) &&
    hasNonNegativeInteger(reference, WorkbookReferenceField.startCol) &&
    hasNonNegativeInteger(reference, WorkbookReferenceField.endCol)
  );
}

/** Reports whether an unknown value is a valid workbook-qualified whole-row range reference. */
export function isWorkbookRowRangeReference(reference: unknown): reference is WorkbookRowRangeReference {
  if (!isRecord(reference)) return false;
  return (
    hasSheetId(reference) &&
    hasNonNegativeInteger(reference, WorkbookReferenceField.startRow) &&
    hasNonNegativeInteger(reference, WorkbookReferenceField.endRow)
  );
}

/** Reports whether an unknown value is any valid workbook-qualified formula reference. */
export function isValidWorkbookReference(reference: unknown): reference is WorkbookFormulaReference {
  return (
    isWorkbookCellReference(reference) ||
    isWorkbookRangeReference(reference) ||
    isWorkbookColumnRangeReference(reference) ||
    isWorkbookRowRangeReference(reference)
  );
}

function assertCellReference(reference: Partial<WorkbookCellReference>): void {
  const sheetId = reference[WorkbookReferenceField.sheetId];
  if (typeof sheetId !== 'string' || sheetId.length === 0) {
    throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook cell reference requires a sheet id.', {
      reference,
    });
  }
  assertNonNegativeInteger(reference[WorkbookReferenceField.row], WorkbookReferenceField.row, reference);
  assertNonNegativeInteger(reference[WorkbookReferenceField.col], WorkbookReferenceField.col, reference);
}

function assertRangeReference(reference: WorkbookRangeReference): void {
  if (
    typeof reference[WorkbookReferenceField.sheetId] !== 'string' ||
    reference[WorkbookReferenceField.sheetId].length === 0
  ) {
    throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook range reference requires a sheet id.', {
      reference,
    });
  }
  assertCoordinate(reference[WorkbookReferenceField.start], WorkbookReferenceField.start, reference);
  assertCoordinate(reference[WorkbookReferenceField.end], WorkbookReferenceField.end, reference);
}

function assertColumnRangeReference(reference: WorkbookColumnRangeReference): void {
  if (
    typeof reference[WorkbookReferenceField.sheetId] !== 'string' ||
    reference[WorkbookReferenceField.sheetId].length === 0
  ) {
    throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook column reference requires a sheet id.', {
      reference,
    });
  }
  assertNonNegativeInteger(
    reference[WorkbookReferenceField.startCol],
    WorkbookReferenceField.startCol,
    reference,
  );
  assertNonNegativeInteger(reference[WorkbookReferenceField.endCol], WorkbookReferenceField.endCol, reference);
}

function assertRowRangeReference(reference: WorkbookRowRangeReference): void {
  if (
    typeof reference[WorkbookReferenceField.sheetId] !== 'string' ||
    reference[WorkbookReferenceField.sheetId].length === 0
  ) {
    throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook row reference requires a sheet id.', {
      reference,
    });
  }
  assertNonNegativeInteger(
    reference[WorkbookReferenceField.startRow],
    WorkbookReferenceField.startRow,
    reference,
  );
  assertNonNegativeInteger(reference[WorkbookReferenceField.endRow], WorkbookReferenceField.endRow, reference);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function hasSheetId(reference: Record<string, unknown>): boolean {
  const sheetId = reference[WorkbookReferenceField.sheetId];
  return typeof sheetId === 'string' && sheetId.length > 0;
}

function hasCoordinate(
  reference: Record<string, unknown>,
  field: typeof WorkbookReferenceField.start | typeof WorkbookReferenceField.end,
): boolean {
  const coordinate = reference[field];
  return (
    Array.isArray(coordinate) &&
    coordinate.length === 2 &&
    Number.isInteger(coordinate[WorkbookCoordinateIndex[WorkbookCoordinateAxis.row]]) &&
    coordinate[WorkbookCoordinateIndex[WorkbookCoordinateAxis.row]] >= 0 &&
    Number.isInteger(coordinate[WorkbookCoordinateIndex[WorkbookCoordinateAxis.col]]) &&
    coordinate[WorkbookCoordinateIndex[WorkbookCoordinateAxis.col]] >= 0
  );
}

function hasNonNegativeInteger(reference: Record<string, unknown>, field: WorkbookReferenceField): boolean {
  const value = reference[field];
  return Number.isInteger(value) && (value as number) >= 0;
}

function assertCoordinate(
  coordinate: readonly [number, number],
  field: typeof WorkbookReferenceField.start | typeof WorkbookReferenceField.end,
  reference: WorkbookRangeReference,
): void {
  if (!Array.isArray(coordinate) || coordinate.length !== 2) {
    throw new WorkbookError(WorkbookErrorCode.invalidReference, `Workbook range reference has an invalid ${field}.`, {
      reference,
      field,
    });
  }
  assertNonNegativeInteger(
    coordinate[WorkbookCoordinateIndex[WorkbookCoordinateAxis.row]],
    createCoordinateDiagnosticField(field, WorkbookCoordinateAxis.row),
    reference,
  );
  assertNonNegativeInteger(
    coordinate[WorkbookCoordinateIndex[WorkbookCoordinateAxis.col]],
    createCoordinateDiagnosticField(field, WorkbookCoordinateAxis.col),
    reference,
  );
}

function assertNonNegativeInteger(
  value: unknown,
  field: WorkbookReferenceDiagnosticField,
  reference: unknown,
): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new WorkbookError(
      WorkbookErrorCode.invalidReference,
      `Workbook formula reference has an invalid ${field}.`,
      { reference, field, value },
    );
  }
}

function createCoordinateDiagnosticField(
  field: typeof WorkbookReferenceField.start | typeof WorkbookReferenceField.end,
  axis: WorkbookCoordinateAxis,
): WorkbookReferenceDiagnosticField {
  return `${field}.${axis}`;
}

function formatA1Cell(row: number, col: number): string {
  return `${columnLabel(col)}${row + 1}`;
}

function parseDisplayedWorkbookRangeReference(reference: string): {
  sheetName: string;
  start: readonly [number, number];
  end: readonly [number, number];
} {
  const trimmed = reference.trim();
  if (trimmed.length === 0) {
    throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook formula reference is empty.', {
      reference,
    });
  }
  const parsedSheet = parseDisplayedSheetName(trimmed);
  const rangeText = trimmed.slice(parsedSheet.nextIndex);
  const [startText, endText = startText, ...extra] = rangeText.split(':');
  if (extra.length > 0) {
    throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook formula reference has an invalid range.', {
      reference,
    });
  }
  const start = parseA1Cell(startText);
  const end = parseA1Cell(endText);
  return {
    sheetName: parsedSheet.sheetName,
    start: [start.row, start.col],
    end: [end.row, end.col],
  };
}

function parseDisplayedSheetName(reference: string): { sheetName: string; nextIndex: number } {
  if (reference[0] === "'") return parseQuotedSheetName(reference);
  const bangIndex = reference.indexOf('!');
  if (bangIndex <= 0) {
    throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook formula reference requires a sheet name.', {
      reference,
    });
  }
  return { sheetName: reference.slice(0, bangIndex), nextIndex: bangIndex + 1 };
}

function parseQuotedSheetName(reference: string): { sheetName: string; nextIndex: number } {
  let sheetName = '';
  for (let index = 1; index < reference.length; index += 1) {
    const char = reference[index];
    if (char === "'" && reference[index + 1] === "'") {
      sheetName += "'";
      index += 1;
      continue;
    }
    if (char === "'") {
      if (reference[index + 1] !== '!') break;
      if (sheetName.length === 0) {
        throw new WorkbookError(WorkbookErrorCode.invalidSheetName, 'Workbook sheet name cannot be empty.', {
          reference,
        });
      }
      return { sheetName, nextIndex: index + 2 };
    }
    sheetName += char;
  }
  throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook formula reference has an invalid sheet name.', {
    reference,
  });
}

function parseA1Cell(reference: string): { row: number; col: number } {
  const match = /^\$?([A-Za-z]+)\$?([1-9][0-9]*)$/.exec(reference);
  if (!match) {
    throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook formula reference has an invalid cell.', {
      reference,
    });
  }
  return { row: Number(match[2]) - 1, col: parseColumnLabel(match[1]) };
}

function parseColumnLabel(label: string): number {
  let index = 0;
  for (const char of label.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) {
      throw new WorkbookError(WorkbookErrorCode.invalidReference, 'Workbook formula reference has an invalid column.', {
        label,
      });
    }
    index = index * 26 + code - 64;
  }
  return index - 1;
}

function columnLabel(col: number): string {
  let index = col + 1;
  let label = '';
  while (index > 0) {
    const remainder = (index - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    index = Math.floor((index - 1) / 26);
  }
  return label;
}
