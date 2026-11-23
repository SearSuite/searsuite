import { type FormulaAST } from './FormulaAST';
import { FormulaNodeKind } from './FormulaNodeKind';
import { type StructureMoveChange } from './StructureMoveChange';
import { StructureChangeAxis } from './StructureChangeAxis';
import { shiftStructureCoordinate } from './shiftStructureCoordinate';
import { mapFormulaReferenceNodes } from './mapFormulaReferenceNodes';
import { type FormulaStructureMoveOptions } from './FormulaStructureMoveOptions';

/** Reorders reference identities (including absolute references) through the entire permutation. */
export function reorderFormulaReferences(
  ast: FormulaAST,
  changes: readonly StructureMoveChange[],
  options: FormulaStructureMoveOptions = {},
): FormulaAST {
  const shift = (coordinate: number, axis: StructureChangeAxis) =>
    shiftStructureCoordinate({ coordinate, axis, changes }).value;
  const point = ([row, column]: readonly [number, number]): [number, number] => [
    shift(row, StructureChangeAxis.Row),
    shift(column, StructureChangeAxis.Col),
  ];
  return mapFormulaReferenceNodes(ast, (node) => {
    if (
      (node.kind === FormulaNodeKind.WorkbookCell || node.kind === FormulaNodeKind.WorkbookRange) &&
      node.sheetName.toLowerCase() !== options.sheetName?.toLowerCase()
    )
      return node;
    if (
      options.includeUnqualified === false &&
      node.kind !== FormulaNodeKind.WorkbookCell &&
      node.kind !== FormulaNodeKind.WorkbookRange
    )
      return node;
    switch (node.kind) {
      case FormulaNodeKind.Cell:
      case FormulaNodeKind.WorkbookCell: {
        const [row, col] = point([node.row, node.col]);
        return row === node.row && col === node.col ? node : { ...node, row, col };
      }
      case FormulaNodeKind.Range:
      case FormulaNodeKind.WorkbookRange: {
        const a = point(node.start);
        const b = point(node.end);
        if (a.every((value, i) => value === node.start[i]) && b.every((value, i) => value === node.end[i])) return node;
        return {
          ...node,
          start: [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
          end: [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
        };
      }
      case FormulaNodeKind.RowRange: {
        const a = shift(node.startRow, StructureChangeAxis.Row);
        const b = shift(node.endRow, StructureChangeAxis.Row);
        return a === node.startRow && b === node.endRow
          ? node
          : { ...node, startRow: Math.min(a, b), endRow: Math.max(a, b) };
      }
      case FormulaNodeKind.ColumnRange: {
        const a = shift(node.startCol, StructureChangeAxis.Col);
        const b = shift(node.endCol, StructureChangeAxis.Col);
        return a === node.startCol && b === node.endCol
          ? node
          : { ...node, startCol: Math.min(a, b), endCol: Math.max(a, b) };
      }
    }
  });
}
