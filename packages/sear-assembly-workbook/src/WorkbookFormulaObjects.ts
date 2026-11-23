import { FormulaNodeKind, type FormulaAST, type IFormulaParser } from '@searsuite/sear-domain-formula-engine';
import { FormulaFormatter, FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import { type WorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { type SheetDocumentState } from '@searsuite/sear-assembly-setup';

/** Metadata key owned by workbook formula evaluation. */
export const WorkbookFormulaObjectsMetadataKey = 'searsuite.workbook.formulaObjects';

export interface WorkbookFormulaTable {
  readonly name: string;
  readonly sheet: string;
  readonly range: string;
  readonly headers: boolean;
}

export interface WorkbookFormulaObjects {
  readonly names?: Readonly<Record<string, string>>;
  readonly tables?: readonly WorkbookFormulaTable[];
}

/** Keeps document-owned names and tables attached to their sheet after a rename. */
export function renameWorkbookFormulaObjectsSheet(
  state: WorkbookDocumentState<SheetDocumentState>,
  previousName: string,
  nextName: string,
): WorkbookDocumentState<SheetDocumentState> {
  const objects = state.metadata?.[WorkbookFormulaObjectsMetadataKey] as WorkbookFormulaObjects | undefined;
  if (!objects) return state;
  const parser = new FormulaParser();
  const formatter = new FormulaFormatter();
  const names = Object.fromEntries(Object.entries(objects.names ?? {}).map(([name, source]) => {
    const ast = parser.parse(source);
    const hasReference = parser.extractDependencies(ast).some((dependency) =>
      (dependency.kind === FormulaNodeKind.WorkbookCell || dependency.kind === FormulaNodeKind.WorkbookRange) &&
      dependency.sheetName.split(':').some((part) => part.toUpperCase() === previousName.toUpperCase()),
    );
    return [name, hasReference ? formatter.format(ast, {
      resolveSheetName: (sheetName) => sheetName.toUpperCase() === previousName.toUpperCase() ? nextName : undefined,
    }) : source];
  }));
  const tables = objects.tables?.map((table) => table.sheet.toUpperCase() === previousName.toUpperCase()
    ? { ...table, sheet: nextName }
    : table);
  if (Object.entries(names).every(([name, source]) => objects.names?.[name] === source) &&
    tables?.every((table, index) => table === objects.tables?.[index])) return state;
  return {
    ...state,
    metadata: {
      ...state.metadata,
      [WorkbookFormulaObjectsMetadataKey]: { ...objects, names, ...(tables ? { tables } : {}) },
    },
  };
}

/** Resolves workbook-owned names and table columns before dependency extraction. */
export function bindWorkbookFormulaObjects(
  ast: FormulaAST,
  parser: IFormulaParser,
  state: WorkbookDocumentState<SheetDocumentState>,
): { ast: FormulaAST; expanded: boolean } {
  const objects = state.metadata?.[WorkbookFormulaObjectsMetadataKey] as WorkbookFormulaObjects | undefined;
  let expanded = false;
  const resolving = new Set<string>();
  const bind = (node: FormulaAST): FormulaAST => {
    switch (node.kind) {
      case FormulaNodeKind.Name: {
        const tableMatch = /^([^\[\]]+)\[(.+)\]$/.exec(node.name);
        if (tableMatch) {
          const table = objects?.tables?.find((candidate) => candidate.name.toUpperCase() === tableMatch[1].toUpperCase());
          if (!table) return node;
          const sheet = state.sheets.find((candidate) => candidate.name.toUpperCase() === table.sheet.toUpperCase());
          const range = parser.parse(`=${table.range}`);
          if (!sheet || range.kind !== FormulaNodeKind.Range) return node;
          const data = state.sheetStates[sheet.id]?.sheetData;
          if (!data) return node;
          const specifier = readTableSpecifier(tableMatch[2]);
          if (!specifier) return node;
          if (specifier.section === 'headers' && !table.headers) return node;
          const column = specifier.column === null
            ? null
            : Array.from({ length: range.end[1] - range.start[1] + 1 }, (_, offset) => range.start[1] + offset)
              .find((col) => String(data.getItem(range.start[0], col)?.value ?? '').toUpperCase() === specifier.column?.toUpperCase());
          if (column === undefined) return node;
          const startRow = range.start[0] + (table.headers && specifier.section === 'data' ? 1 : 0);
          const endRow = specifier.section === 'headers' ? range.start[0] : range.end[0];
          if (startRow > endRow) return node;
          expanded = true;
          return {
            ...range,
            kind: FormulaNodeKind.WorkbookRange,
            sheetName: sheet.name,
            start: [startRow, column ?? range.start[1]],
            end: [endRow, column ?? range.end[1]],
          };
        }
        const name = node.name.toUpperCase();
        const definition = Object.entries(objects?.names ?? {}).find(([key]) => key.toUpperCase() === name)?.[1];
        if (!definition || resolving.has(name)) return node;
        resolving.add(name);
        try {
          const result = bind(parser.parse(definition));
          expanded = true;
          return result;
        } finally {
          resolving.delete(name);
        }
      }
      case FormulaNodeKind.WorkbookCell:
      case FormulaNodeKind.WorkbookRange: {
        const [first, last, extra] = node.sheetName.split(':');
        if (!last || extra) return node;
        const start = state.sheets.findIndex((sheet) => sheet.name.toUpperCase() === first.toUpperCase());
        const end = state.sheets.findIndex((sheet) => sheet.name.toUpperCase() === last.toUpperCase());
        if (start < 0 || end < 0) return node;
        expanded = true;
        return {
          kind: FormulaNodeKind.Array,
          rows: state.sheets.slice(Math.min(start, end), Math.max(start, end) + 1).map((sheet) => [
            { ...node, sheetName: sheet.name },
          ]),
        };
      }
      case FormulaNodeKind.Call:
        return { ...node, args: node.args.map(bind) };
      case FormulaNodeKind.Invoke:
        return { ...node, callee: bind(node.callee), args: node.args.map(bind) };
      case FormulaNodeKind.Binary:
      case FormulaNodeKind.Intersection:
        return { ...node, left: bind(node.left), right: bind(node.right) };
      case FormulaNodeKind.Unary:
        return { ...node, operand: bind(node.operand) };
      case FormulaNodeKind.Tuple:
        return { ...node, items: node.items.map(bind) };
      case FormulaNodeKind.Array:
        return { ...node, rows: node.rows.map((row) => row.map(bind)) };
      default:
        return node;
    }
  };
  return { ast: bind(ast), expanded };
}

function readTableSpecifier(value: string): { section: 'all' | 'data' | 'headers'; column: string | null } | null {
  const normalized = value.trim();
  const section = /^#(ALL|DATA|HEADERS)$/i.exec(normalized);
  if (section) return { section: section[1].toLowerCase() as 'all' | 'data' | 'headers', column: null };
  const qualified = /^\[#(ALL|DATA|HEADERS)\],\[([^\[\]]+)\]$/i.exec(normalized);
  if (qualified) return { section: qualified[1].toLowerCase() as 'all' | 'data' | 'headers', column: qualified[2] };
  return /^[^\[\]#]+$/.test(normalized) ? { section: 'data', column: normalized } : null;
}
