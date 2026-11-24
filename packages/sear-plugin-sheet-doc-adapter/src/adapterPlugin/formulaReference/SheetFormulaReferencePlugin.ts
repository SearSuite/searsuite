import type { SheetDocument, SheetRenderUpdate } from '@searsuite/sear-sheet-editor-contract';
import type {
  SheetEmbeddedEditorPlugin,
  SheetEmbeddedEditorPluginContext,
} from '../embeddedEditor/SheetEmbeddedEditorPlugin';

/** Finds formula-like references for Sheet overlays without changing document data. */
export class SheetFormulaReferencePlugin implements SheetEmbeddedEditorPlugin {
  public readonly key = 'sheet.formula-reference';
  #references: string[] = [];

  public initialize(context: SheetEmbeddedEditorPluginContext): void {
    this.#references = this.#collectReferences(context.document);
  }

  public onRender(_update: SheetRenderUpdate, context: SheetEmbeddedEditorPluginContext): void {
    this.#references = this.#collectReferences(context.document);
  }

  public getReferences(): readonly string[] {
    return [...this.#references];
  }

  public dispose(): void {
    this.#references = [];
  }

  #collectReferences(document: SheetDocument): string[] {
    const references: string[] = [];
    const visit = (nodes: SheetDocument): void => {
      nodes.forEach((node) => {
        if (typeof node.text === 'string' && node.text.startsWith('=')) {
          const matches = node.text.match(/(?:'[^']+'|[A-Za-z_][\w ]*)!?\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?/g);
          if (matches) references.push(...matches);
        }
        if (Array.isArray(node.content)) visit(node.content as SheetDocument);
      });
    };
    visit(document);
    return [...new Set(references)];
  }
}
