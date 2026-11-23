import { RichDocNode } from './RichDocNode';
import { type NodeSchema } from './RichDocSchema';

/** Built-in table row node. */
export class TableRowNode extends RichDocNode {
  /** Persisted schema type owned by the table document feature. */
  public static readonly nodeType = 'tableRow';

  /** Creates a table row node from persisted schema. */
  constructor(schema: NodeSchema) {
    super(TableRowNode.nodeType);
    this.initialize(schema);
  }
}
