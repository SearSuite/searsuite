import { RichDocNode } from './RichDocNode';
import { type NodeSchema } from './RichDocSchema';

/** Built-in paragraph node. */
export class ParagraphNode extends RichDocNode {
  /** Persisted schema type owned by the paragraph document feature. */
  public static readonly nodeType = 'paragraph';

  /** Creates a paragraph node from persisted schema. */
  constructor(schema: NodeSchema) {
    super(ParagraphNode.nodeType);
    this.initialize(schema);
  }
}
