import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { assertCellExtensionWrite } from '@searsuite/sear-domain-cell-types';
import { PositionRectProps } from '@searsuite/sear-foundation-rect';
import { Node, NodeProperties } from '@searsuite/sear-render-node';

import { NodeFactory } from './NodeFactory';
import { CellProperties, Cell, CellContext } from './Cell';

/** Constructor shape accepted by the sheet node factory registry. */
type RegisteredCell = new (
  data: CellProperties<unknown>,
  positionRect: PositionRectProps,
  properties: unknown,
  context?: CellContext,
) => Cell<CellProperties<unknown>>;

/** Default NodeFactory implementation for sheet cells. */
@Injectable()
export class SheetNodeFactory implements NodeFactory<Cell<CellProperties<unknown>>> {
  /** Registered cell constructors keyed by cell type symbol. */
  readonly #registry = new Map<string | symbol, RegisteredCell>();

  /**
   * Registers a cell constructor for one sheet cell type.
   * @param type - Cell type identifier.
   * @param ctor - Cell constructor used to create render cells.
   * @returns Disposer that restores the previous constructor for this type.
   */
  register<DataType, Properties>(
    type: string | symbol,
    ctor: new (data: DataType, positionRect: PositionRectProps, properties: Properties, context?: CellContext) => Cell<
      CellProperties<unknown>
    >,
  ): () => void {
    assertCellExtensionWrite(this);
    const key = typeof type === 'string' ? Symbol.for(type) : type;
    const previous = this.#registry.get(key);
    const registered = ctor as RegisteredCell;
    this.#registry.set(key, registered);
    const factory = this;
    return function unregisterSheetNodeFactory(): void {
      assertCellExtensionWrite(factory);
      if (factory.#registry.get(key) !== registered) return;
      if (previous) factory.#registry.set(key, previous);
      else factory.#registry.delete(key);
    };
  }

  /**
   * Creates a registered sheet cell instance.
   * @param data - Cell data carrying a type identifier.
   * @param positionRect - Cell bounds.
   * @param properties - Render properties.
   * @param context - Optional cell rendering context.
   * @returns Created Cell instance.
   */
  create<DataType extends { type: string | symbol }, Properties>(
    data: DataType,
    positionRect: PositionRectProps,
    properties: Properties,
    context: CellContext = {},
  ): Cell<CellProperties<unknown>> {
    const key = typeof data.type === 'string' ? Symbol.for(data.type) : data.type;
    const ctor = this.#registry.get(key);
    if (!ctor) throw new SearError(`Cell type not registered: ${key.toString()}`);

    return new ctor(data as CellProperties<unknown>, positionRect, properties, context);
  }
}
