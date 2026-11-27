import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { type Schema } from '@searsuite/sear-domain-doc-schema';

/** Returns the explicit color shared by every text node in a rich-text cell. */
export function readRichTextCellColor(cell: CellMatrixElement | null): string | null {
  if (cell?.type !== CellType.RichText || !Array.isArray(cell.value)) return null;
  let color: string | null = null;
  let hasText = false;
  let mixed = false;
  const visit = (node: Schema, inherited: string | null): void => {
    const style = node.attrs?.['textStyle'];
    const ownColor = style && typeof style === 'object' ? (style as Record<string, unknown>)['color'] : null;
    const effectiveColor = typeof ownColor === 'string' ? ownColor : inherited;
    if (node.text) {
      hasText = true;
      if (effectiveColor === null) mixed = true;
      else if (color === null) color = effectiveColor;
      else if (color.toLowerCase() !== effectiveColor.toLowerCase()) mixed = true;
    }
    node.content?.forEach((child) => visit(child, effectiveColor));
  };
  (cell.value as Schema[]).forEach((node) => visit(node, null));
  return hasText && !mixed ? color : null;
}
