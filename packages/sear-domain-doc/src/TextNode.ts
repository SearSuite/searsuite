import { RichDocNode } from './RichDocNode';
import { type NodeSchema, type TextSchema } from './RichDocSchema';

/** Built-in text leaf node. */
export class TextNode extends RichDocNode {
  /** Persisted schema type owned by the text input document feature. */
  public static readonly nodeType = 'text';

  /** Text content carried by this leaf node. */
  text?: string;
  /** Creates a text node from a generic node schema. */
  constructor(schema: NodeSchema);
  /** Creates a text node from a text-bearing schema. */
  constructor(schema: TextSchema);
  /** Creates a text node from persisted schema. */
  constructor(schema: NodeSchema | TextSchema) {
    super(TextNode.nodeType);
    if ('text' in schema) {
      this.text = schema.text;
    }
    this.initialize(schema);
  }
}
