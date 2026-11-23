import { PositionRectProps } from '@searsuite/sear-foundation-rect';
import { CellContext } from './Cell';

/** Factory contract for creating renderable cell/node instances by data type. */
export abstract class NodeFactory<NodeType> {
  /** DI token for resolving the active node factory. */
  public static readonly symbol: symbol = Symbol.for('NodeFactory');

  /**
   * Creates a node instance for typed data.
   * @param data - Persisted or rendering-only cell data.
   * @param positionRect - Node bounds.
   * @param properties - Render properties passed to the node.
   * @param context - Optional cell rendering context.
   * @returns Created node instance.
   */
  abstract create<DataType extends { type: symbol }, Properties>(
    data: DataType,
    positionRect: PositionRectProps,
    properties: Properties,
    context?: CellContext,
  ): NodeType;

  /**
   * Registers a constructor for a cell or node type.
   * @param type - Type identifier used by incoming data.
   * @param ctor - Constructor used to create the node.
   * @returns Disposer that restores the previous registration.
   */
  abstract register<DataType, Properties>(
    type: string | symbol,
    ctor: new (
      data: DataType,
      positionRect: PositionRectProps,
      properties: Properties,
      context?: CellContext,
    ) => NodeType,
  ): () => void;
}
