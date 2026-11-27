import { SearError } from '@searsuite/sear-foundation-error';
import { type Container } from '@searsuite/sear-foundation-di';
import { RenderContext } from '@searsuite/sear-render-context';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor, releaseColor } from '@searsuite/sear-foundation-utils';

import { Node } from './Node';
import { FrameDirtyTracker } from './FrameDirtyTracker';
import { NodeProperties, type RenderNodeKey } from './types';

/**
 * Editor-local scene tree assembled from plugin-owned render nodes.
 *
 * Each plugin registers its top-level nodes under a stable key. Replacing or
 * reconciling those nodes updates the tree and marks affected regions dirty;
 * the render engine then paints the current tree. Stable node keys allow
 * retained nodes to survive an update when their geometry has not changed.
 */
export class SceneGraph<T extends NodeProperties> extends Node<T> {
  /** DI token for resolving the scene graph. */
  public static readonly symbol: symbol = Symbol.for('SceneGraph');

  /** Plugin key to top-level render-node keys registered by that plugin. */
  #pluginKeysMap: Map<string, RenderNodeKey[]> = new Map();

  /** Creates a scene graph bound to one editor-local DI runtime. */
  public constructor(container: Container) {
    super();
    this.bindRuntime(container);
  }

  /** Dirty tracker resolved lazily so tests can replace the DI binding. */
  get #dirtyTree(): FrameDirtyTracker {
    return this.resolveRuntime<FrameDirtyTracker>(FrameDirtyTracker.symbol);
  }

  /**
   * Replaces all scene nodes owned by one plugin.
   * @param pluginKeyString - Stable plugin key.
   * @param node - Node or nodes produced by the plugin render method.
   */
  public addPluginNode(
    pluginKeyString: string,
    node: Node<T> | Node<T>[],
    options: { readonly markDirty?: boolean } = {},
  ) {
    const markDirty = options.markDirty !== false;
    this.markRemovePluginNode(pluginKeyString, { markDirty });

    const nodes = Array.isArray(node) ? node : [node];
    const keys: RenderNodeKey[] = [];
    for (const n of nodes) {
      keys.push(n.nodeKey);
      n.positionRect.key = n.nodeKey;
      if (markDirty) this.#dirtyTree.mark(toDirtyRect(n.positionRect));
    }

    this.#pluginKeysMap.set(pluginKeyString, keys);
    this.add(nodes);
  }

  /**
   * Reconciles one plugin's top-level nodes by stable node key.
   *
   * Existing nodes with keys that are still present can be retained, new keys
   * are inserted, and keys no longer returned by the plugin are removed. This
   * is the block-level retained path used by virtualized document rendering.
   */
  public reconcilePluginNodes(
    pluginKeyString: string,
    node: Node<T> | Node<T>[],
    options: {
      readonly markDirty?: boolean;
      readonly retainExisting?: boolean;
      readonly updateRetainedGeometry?: boolean;
      readonly replaceRetainedKeys?: ReadonlySet<RenderNodeKey>;
      readonly replaceRetainedGeometryChanged?: boolean;
    } = {},
  ): void {
    const markDirty = options.markDirty !== false;
    const retainExisting = options.retainExisting !== false;
    const updateRetainedGeometry = options.updateRetainedGeometry === true;
    const previousKeys = new Set(this.#pluginKeysMap.get(pluginKeyString) ?? []);
    const nodes = Array.isArray(node) ? node : [node];
    const nextKeys: RenderNodeKey[] = [];

    for (const nextNode of nodes) {
      const nodeKey = nextNode.nodeKey;
      nextKeys.push(nodeKey);
      previousKeys.delete(nodeKey);
      const retainedNode = this.dataStorage.get(nodeKey);
      if (retainExisting && retainedNode) {
        const shouldReplaceRetained =
          (options.replaceRetainedKeys?.has(nodeKey) ?? false) ||
          (options.replaceRetainedGeometryChanged === true &&
            !hasSameRectSize(retainedNode.positionRect, nextNode.positionRect));
        if (shouldReplaceRetained) {
          this.#removePluginNodeByKey(nodeKey, { markDirty });
          nextNode.positionRect.key = nodeKey;
          if (markDirty) this.#dirtyTree.mark(toDirtyRect(nextNode.positionRect));
          this.add(nextNode);
          continue;
        }
        if (updateRetainedGeometry) this.#updateRetainedNodeGeometry(retainedNode, nextNode, { markDirty });
        releaseUnattachedHitColor(nextNode);
        continue;
      }
      this.#removePluginNodeByKey(nodeKey, { markDirty });
      nextNode.positionRect.key = nodeKey;
      if (markDirty) this.#dirtyTree.mark(toDirtyRect(nextNode.positionRect));
      this.add(nextNode);
    }

    for (const removedKey of previousKeys) {
      this.#removePluginNodeByKey(removedKey, { markDirty });
    }
    this.#pluginKeysMap.set(pluginKeyString, nextKeys);
  }

  #updateRetainedNodeGeometry(
    retainedNode: Node<T>,
    nextNode: Node<T>,
    options: { readonly markDirty: boolean },
  ): void {
    if (!hasSameRectSize(retainedNode.positionRect, nextNode.positionRect)) return;
    if (hasSameRectPosition(retainedNode.positionRect, nextNode.positionRect)) return;
    if (options.markDirty) this.#dirtyTree.mark(toDirtyRect(retainedNode.positionRect));
    this.positionRectStorage.remove(retainedNode.positionRect, (rect) => rect.key === retainedNode.nodeKey);
    retainedNode.positionRect.updatePosition(nextNode.positionRect.x, nextNode.positionRect.y);
    retainedNode.positionRect.key = retainedNode.nodeKey;
    this.positionRectStorage.insert(retainedNode.positionRect);
    if (options.markDirty) this.#dirtyTree.mark(toDirtyRect(retainedNode.positionRect));
  }

  /**
   * Marks and removes all existing top-level nodes owned by one plugin.
   * @param pluginKeyString - Stable plugin key.
   */
  public markRemovePluginNode(pluginKeyString: string, options: { readonly markDirty?: boolean } = {}) {
    const markDirty = options.markDirty !== false;
    const keys = this.#pluginKeysMap.get(pluginKeyString);

    if (keys) {
      for (const key of keys) this.#removePluginNodeByKey(key, { markDirty });
      this.#pluginKeysMap.delete(pluginKeyString);
    }
  }

  #removePluginNodeByKey(key: RenderNodeKey, options: { readonly markDirty: boolean }): void {
    const node = this.dataStorage.get(key);
    if (!node) return;
    if (options.markDirty) this.#dirtyTree.mark(toDirtyRect(node.positionRect));
    const removedSet = this.#collectNodeKeys(node);
    node.dispose();
    this.#removeChildKeys(removedSet);
  }

  #collectNodeKeys(node: Node<T>): ReadonlySet<RenderNodeKey> {
    const removedSet = new Set<RenderNodeKey>();
    const graph = this;
    function collectRemovedNodeKeys(current: Node<T>): void {
      removedSet.add(current.nodeKey);
      for (const childKey of current.childKeys) {
        const childNode = graph.dataStorage.get(childKey);
        if (childNode) collectRemovedNodeKeys(childNode);
      }
    }
    collectRemovedNodeKeys(node);
    return removedSet;
  }

  #removeChildKeys(removedSet: ReadonlySet<RenderNodeKey>): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.childKeys.length; readIndex++) {
      if (!removedSet.has(this.childKeys[readIndex])) {
        this.childKeys[writeIndex++] = this.childKeys[readIndex];
      }
    }
    this.childKeys.length = writeIndex;
  }

  /** SceneGraph is a root container and is not drawn directly. */
  public drawScene(context: RenderContext): void {
    throw new SearError('SceneGraph.drawScene is not supported; render through RenderStrategyManager.');
  }

  /** SceneGraph is a root container and is not drawn into the hit layer directly. */
  public drawHit(context: RenderContext): void {
    throw new SearError('SceneGraph.drawHit is not supported; render hit layers through RenderStrategyManager.');
  }

  /** SceneGraph is cleared through strategy-owned dirty regions. */
  public clear(context: RenderContext): void {
    throw new SearError('SceneGraph.clear is not supported; clear through render strategies.');
  }
}

function toDirtyRect(rect: PositionRect<RenderNodeKey>): PositionRect<HexColor> {
  return new PositionRect<HexColor>(rect.x, rect.y, rect.width, rect.height);
}

function hasSameRectSize(first: PositionRect<RenderNodeKey>, second: PositionRect<RenderNodeKey>): boolean {
  return first.width === second.width && first.height === second.height;
}

function hasSameRectPosition(first: PositionRect<RenderNodeKey>, second: PositionRect<RenderNodeKey>): boolean {
  return first.x === second.x && first.y === second.y;
}

function releaseUnattachedHitColor<T extends NodeProperties>(node: Node<T>): void {
  if (node.randomColorKey) releaseColor(node.randomColorKey);
}
