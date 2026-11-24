import { Injectable } from '@searsuite/sear-foundation-di';
import { type Node } from './Node';
import { type HitColorKey, type NodeProperties } from './types';

/** Maps hit-canvas color keys back to render nodes. */
@Injectable()
export class HitColorRegistry {
  /** DI token for resolving the hit-color registry. */
  public static readonly symbol: symbol = Symbol.for('HitColorRegistry');

  readonly #nodesByHitColor = new Map<HitColorKey, Node<NodeProperties>>();

  /** Registers a node for hit-canvas color lookup. */
  public register<T extends NodeProperties>(key: HitColorKey, node: Node<T>): void {
    this.#nodesByHitColor.set(key, node);
  }

  /** Resolves the node currently associated with a hit-canvas color key. */
  public get<T extends NodeProperties>(key: HitColorKey): Node<T> | undefined {
    return this.#nodesByHitColor.get(key) as Node<T> | undefined;
  }

  /** Removes a hit-canvas color key mapping. */
  public delete(key: HitColorKey): void {
    this.#nodesByHitColor.delete(key);
  }

  /** Clears all registered hit-color mappings. */
  public clear(): void {
    this.#nodesByHitColor.clear();
  }
}
