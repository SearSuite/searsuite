import { RichDocNode } from './RichDocNode';
import { type NodeSchema } from './RichDocSchema';

/** Built-in table cell node. */
export class TableCellNode extends RichDocNode {
  /** Persisted schema type owned by the table document feature. */
  public static readonly nodeType = 'tableCell';

  /** Creates a table cell node from persisted schema. */
  constructor(schema: NodeSchema) {
    super(TableCellNode.nodeType);
    this.initialize(schema);
  }
}
