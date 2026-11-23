import { RichDocNode } from './RichDocNode';
import { type NodeSchema } from './RichDocSchema';

/** Built-in table block node. */
export class TableNode extends RichDocNode {
  /** Persisted schema type owned by the table document feature. */
  public static readonly nodeType = 'table';

  /** Creates a table node from persisted schema. */
  constructor(schema: NodeSchema) {
    super(TableNode.nodeType);
    this.initialize(schema);
  }
}
