import { Injectable } from '@searsuite/sear-foundation-di';
import { Node, NodeProperties } from '@searsuite/sear-render-node';

/** Coordinates cell creation and rendering for a concrete renderer registry. */
@Injectable()
export abstract class RenderCoordinatorManager {
  /** DI token for resolving the active render coordinator manager. */
  public static readonly symbol: symbol = Symbol.for('RenderCoordinatorManager');

  /** Registers cell/node types supported by the coordinator. */
  abstract registerType(): void;

  /** Registers renderer functions supported by the coordinator. */
  abstract registerRenderer(): void;

  /** Creates a cell instance from registered type metadata. */
  abstract create<T>(): T;

  /** Creates and renders a cell from type and render properties. */
  abstract renderCell<T extends NodeProperties>(): Node<T> | Node<T>[];

  /** Renders an already-created cell or node. */
  abstract render<T extends NodeProperties>(): Node<T> | Node<T>[];
}
