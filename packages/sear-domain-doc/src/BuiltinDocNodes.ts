import { DocNodeRegistry, DocNodeRole, type DocNodeDefinition } from './DocNodeRegistry';
import { ParagraphNode } from './ParagraphNode';
import { TableCellNode } from './TableCellNode';
import { TableNode } from './TableNode';
import { TableRowNode } from './TableRowNode';
import { TextNode } from './TextNode';

export { ParagraphNode } from './ParagraphNode';
export { TableCellNode } from './TableCellNode';
export { TableNode } from './TableNode';
export { TableRowNode } from './TableRowNode';
export { TextNode } from './TextNode';

/** Minimal contract required to install document node definitions. */
interface DocNodeRegistrar {
  register(definition: DocNodeDefinition): void;
}

/** Registers the paragraph node type owned by paragraph-oriented document features. */
export function registerParagraphDocNode(registry: DocNodeRegistrar): void {
  registry.register({
    type: ParagraphNode.nodeType,
    create: function createParagraphDocNode(schema) {
      return new ParagraphNode(schema);
    },
    role: DocNodeRole.Block,
    defaultBlock: true,
  });
}

/** Registers the text node type owned by text-input document features. */
export function registerTextDocNode(registry: DocNodeRegistrar): void {
  registry.register({
    type: TextNode.nodeType,
    create: function createTextDocNode(schema) {
      return new TextNode(schema);
    },
    role: DocNodeRole.Text,
    defaultText: true,
  });
}

/** Registers the table node types owned by table-oriented document features. */
export function registerTableDocNodes(registry: DocNodeRegistrar): void {
  registry.register({
    type: TableNode.nodeType,
    create: function createTableDocNode(schema) {
      return new TableNode(schema);
    },
    role: DocNodeRole.Block,
  });
  registry.register({
    type: TableRowNode.nodeType,
    create: function createTableRowDocNode(schema) {
      return new TableRowNode(schema);
    },
  });
  registry.register({
    type: TableCellNode.nodeType,
    create: function createTableCellDocNode(schema) {
      return new TableCellNode(schema);
    },
  });
}
