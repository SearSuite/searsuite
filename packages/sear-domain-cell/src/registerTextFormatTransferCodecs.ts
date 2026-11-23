import { ParagraphNode, TextNode } from '@searsuite/sear-domain-doc';
import { CellType, type CellFormatTransferRegistry, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { type Schema } from '@searsuite/sear-domain-doc-schema';

/** Pure document formatting supplied by an embedded editor implementation. */
export interface CellDocumentFormatting {
  capture(document: readonly Schema[]): Readonly<Record<string, unknown>>;
  apply(document: readonly Schema[], format: Readonly<Record<string, unknown>>): Schema[];
}
/** Text cell type composition; numeric and formula values remain with their own codecs. */
export function registerTextFormatTransferCodecs(
  registry: CellFormatTransferRegistry,
  readFormatting: () => CellDocumentFormatting | undefined,
): () => void {
  const disposers = [CellType.RichText, CellType.String].map((cellType) =>
    registry.register({
      cellType,
      capture: (cell) =>
        cellType === CellType.RichText && Array.isArray(cell.value)
          ? readFormatting()?.capture(cell.value as Schema[]) ?? {}
          : {},
      apply: (cell, format): CellMatrixElement => {
        const formatting = readFormatting();
        if (!formatting) return cell;
        if (cellType === CellType.RichText && Array.isArray(cell.value))
          return { ...cell, value: formatting.apply(cell.value as Schema[], format) };
        if (!Object.keys(format).length) return cell;
        const document: Schema[] = [
          { type: ParagraphNode.nodeType, content: [{ type: TextNode.nodeType, text: String(cell.value ?? '') }] },
        ];
        return { ...cell, type: CellType.RichText, value: formatting.apply(document, format) };
      },
    }),
  );
  return () => disposers.reverse().forEach((dispose) => dispose());
}
