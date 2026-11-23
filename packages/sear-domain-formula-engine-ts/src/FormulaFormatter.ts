import { FormulaErrorCode, FormulaNodeKind, type FormulaAST } from '@searsuite/sear-domain-formula-engine';
import { toCellRef } from './toCellRef';
import { type WorkbookFormulaFormatOptions } from './WorkbookFormulaFormatOptions';

/** Formats the shared FormulaAST back to formula source text. */
export class FormulaFormatter {
  public format(ast: FormulaAST, options: WorkbookFormulaFormatOptions = {}): string {
    return `=${this.formatNode(ast, 0, options)}`;
  }

  private formatNode(ast: FormulaAST, parentPrecedence: number, options: WorkbookFormulaFormatOptions): string {
    switch (ast.kind) {
      case FormulaNodeKind.Number:
        return ast.rawLiteral ?? String(ast.value);
      case FormulaNodeKind.String:
        return `"${ast.value.replace(/"/g, '""')}"`;
      case FormulaNodeKind.Boolean:
        return ast.value ? 'TRUE' : 'FALSE';
      case FormulaNodeKind.Error:
        return ast.code;
      case FormulaNodeKind.Name:
        return ast.name;
      case FormulaNodeKind.Tuple:
        return `(${ast.items.map((item) => this.formatNode(item, 0, options)).join(',')})`;
      case FormulaNodeKind.Intersection:
        return `${this.formatNode(ast.left, 7, options)} ${this.formatNode(ast.right, 7, options)}`;
      case FormulaNodeKind.Array:
        return `{${ast.rows.map((row) => row.map((item) => this.formatNode(item, 0, options)).join(',')).join(';')}}`;
      case FormulaNodeKind.Missing:
        return '';
      case FormulaNodeKind.Cell:
        if (ast.row < 0 || ast.col < 0) return FormulaErrorCode.Reference;
        return toCellRef(ast.row, ast.col, ast.absRow, ast.absCol);
      case FormulaNodeKind.Range:
        if (ast.start[0] < 0 || ast.start[1] < 0 || ast.end[0] < 0 || ast.end[1] < 0) {
          return FormulaErrorCode.Reference;
        }
        return `${toCellRef(ast.start[0], ast.start[1], ast.absStartRow, ast.absStartCol)}:${toCellRef(
          ast.end[0],
          ast.end[1],
          ast.absEndRow,
          ast.absEndCol,
        )}`;
      case FormulaNodeKind.WorkbookCell:
        if (ast.row < 0 || ast.col < 0) return FormulaErrorCode.Reference;
        return `${this.formatSheetName(ast.sheetName, options)}!${toCellRef(ast.row, ast.col, ast.absRow, ast.absCol)}`;
      case FormulaNodeKind.Spill:
        return `${this.formatNode(ast.reference, 7, options)}#`;
      case FormulaNodeKind.WorkbookRange:
        if (ast.start[0] < 0 || ast.start[1] < 0 || ast.end[0] < 0 || ast.end[1] < 0) {
          return FormulaErrorCode.Reference;
        }
        return `${this.formatSheetName(ast.sheetName, options)}!${toCellRef(
          ast.start[0],
          ast.start[1],
          ast.absStartRow,
          ast.absStartCol,
        )}:${toCellRef(ast.end[0], ast.end[1], ast.absEndRow, ast.absEndCol)}`;
      case FormulaNodeKind.ColumnRange:
        return `${formatColumnRef(ast.startCol, ast.absStartCol)}:${formatColumnRef(ast.endCol, ast.absEndCol)}`;
      case FormulaNodeKind.RowRange:
        return `${ast.absStartRow ? '$' : ''}${ast.startRow + 1}:${ast.absEndRow ? '$' : ''}${ast.endRow + 1}`;
      case FormulaNodeKind.Call:
        return `${ast.name}(${ast.args.map((arg) => this.formatNode(arg, 0, options)).join(',')})`;
      case FormulaNodeKind.Invoke:
        return `${this.formatNode(ast.callee, 7, options)}(${ast.args
          .map((arg) => this.formatNode(arg, 0, options))
          .join(',')})`;
      case FormulaNodeKind.Unary: {
        const precedence = ast.op === '%' ? 6 : 5;
        const operand = this.formatNode(ast.operand, precedence, options);
        const formatted = ast.op === '%' ? `${operand}%` : `${ast.op}${operand}`;
        return parenthesizeIfNeeded(formatted, precedence, parentPrecedence);
      }
      case FormulaNodeKind.Binary: {
        const precedence = binaryPrecedence(ast.op);
        const left = this.formatNode(ast.left, precedence, options);
        const right = this.formatNode(ast.right, precedence + (isRightAssociativeSafe(ast.op) ? 0 : 1), options);
        return parenthesizeIfNeeded(`${left}${ast.op}${right}`, precedence, parentPrecedence);
      }
    }
  }

  private formatSheetName(formulaSheetName: string, options: WorkbookFormulaFormatOptions): string {
    const pair = formulaSheetName.split(':');
    if (pair.length === 2) {
      const names = pair.map((name) => options.resolveSheetName?.(name) ?? name);
      return names.every((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        ? names.join(':')
        : quoteWorkbookSheetName(names.join(':'));
    }
    const sheetName = options.resolveSheetName?.(formulaSheetName);
    if (sheetName) return quoteWorkbookSheetName(sheetName);
    return options.missingSheetName ?? quoteWorkbookSheetName(formulaSheetName);
  }
}

function formatColumnRef(col: number, absolute: boolean): string {
  return `${absolute ? '$' : ''}${toCellRef(0, col).replace(/[0-9]+$/, '')}`;
}

function quoteWorkbookSheetName(name: string): string {
  const normalized = name.trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) return normalized;
  return `'${normalized.replace(/'/g, "''")}'`;
}

function binaryPrecedence(op: string): number {
  if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') return 1;
  if (op === '&') return 2;
  if (op === '+' || op === '-') return 3;
  if (op === '*' || op === '/') return 4;
  return 5;
}

function isRightAssociativeSafe(op: string): boolean {
  return op === '+' || op === '*' || op === '&';
}

function parenthesizeIfNeeded(source: string, precedence: number, parentPrecedence: number): string {
  return precedence < parentPrecedence ? `(${source})` : source;
}
