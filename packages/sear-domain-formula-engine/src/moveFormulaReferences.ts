import { type FormulaAST } from './FormulaAST';
import { FormulaNodeKind } from './FormulaNodeKind';

import { type FormulaRangeMove } from './FormulaRangeMove';
import { mapFormulaReferenceNodes } from './mapFormulaReferenceNodes';

/** Moves referenced identities, including absolute references, without rebasing unrelated references. */
export function moveFormulaReferences(ast: FormulaAST, move: FormulaRangeMove): FormulaAST {
  const contains = (row: number, column: number) =>
    row >= move.start[0] && row <= move.end[0] && column >= move.start[1] && column <= move.end[1];
  const shift = (point: readonly [number, number]): [number, number] => [
    point[0] + move.rowOffset,
    point[1] + move.columnOffset,
  ];
  return mapFormulaReferenceNodes(ast, (node) => {
    switch (node.kind) {
      case FormulaNodeKind.WorkbookCell:
        if (node.sheetName.toLowerCase() !== move.sheetName?.toLowerCase()) return node;
        return contains(node.row, node.col)
          ? { ...node, row: node.row + move.rowOffset, col: node.col + move.columnOffset }
          : node;
      case FormulaNodeKind.Cell:
        if (move.includeUnqualified === false) return node;
        return contains(node.row, node.col)
          ? { ...node, row: node.row + move.rowOffset, col: node.col + move.columnOffset }
          : node;
      case FormulaNodeKind.WorkbookRange:
        if (node.sheetName.toLowerCase() !== move.sheetName?.toLowerCase()) return node;
        return contains(...node.start) && contains(...node.end)
          ? { ...node, start: shift(node.start), end: shift(node.end) }
          : node;
      case FormulaNodeKind.Range:
        if (move.includeUnqualified === false) return node;
        return contains(...node.start) && contains(...node.end)
          ? { ...node, start: shift(node.start), end: shift(node.end) }
          : node;
      default:
        return node;
    }
  });
}
