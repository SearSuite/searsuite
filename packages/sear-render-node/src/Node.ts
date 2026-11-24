import { SearError } from '@searsuite/sear-foundation-error';
import { type Container } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { RenderContext } from '@searsuite/sear-render-context';
import { PositionRectProps, PositionRect, emptyPositionRect, Point } from '@searsuite/sear-foundation-rect';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { DataStorage } from '@searsuite/sear-foundation-storage';
import { HexColor, getRandomColor, releaseColor } from '@searsuite/sear-foundation-utils';

/**
 * Clip region passed to `drawScene`.
 * - `PositionRect<HexColor>` — axis-aligned rectangle clip (common case).
 * - `Point[]` — arbitrary polygon clip; each element is an `[x, y]` vertex.
 */
export type ClipRegion = PositionRect<HexColor> | Point[];

import { EventListener } from './EventListener';
import { HitColorRegistry } from './HitColorRegistry';
import { Tree } from './Tree';
import { type HitColorKey, NodeProperties, type RenderNodeKey } from './types';

/**
 * Abstract base class for all nodes in the render tree.
 * Handles geometry, appearance, event management, and hierarchical relationships.
 */
export abstract class Node<T extends NodeProperties> extends EventListener<string> {
  /** Render and event ordering depth for Node. */
  public depth: number = 0;
  /** Whether this node remains fixed while its scroll container moves. */
  public sticky: boolean = false;

  /** Unique random color key used for hit detection. */
  public readonly randomColorKey: HitColorKey | null = getRandomColor();

  /** Stable key used by SceneGraph, DataStorage and spatial indexes. */
  public readonly nodeKey: RenderNodeKey;

  /** Parent node's stable render key, used for tree relationships. */
  public parentKey: RenderNodeKey | null = null;

  /** Keys of direct child nodes registered via add(), used for recursive cleanup. */
  public readonly childKeys: RenderNodeKey[] = [];

  /** Name of the node, defaults to the class name. */
  public name: string = this.constructor.name;

  /** Visual and geometric properties of the node. */
  public properties: Partial<T>;

  /** Rectangle representing the node's position and size. */
  public readonly positionRect: PositionRect<RenderNodeKey> = new PositionRect(0, 0, 0, 0);
  #runtimeContainer: Container | null = null;
  readonly #childNodes = new Map<RenderNodeKey, Node<T>>();

  /** Editor-local configuration for this node's owning scene graph. */
  public get configEngine(): ConfigEngine {
    return this.resolveRuntime(ConfigEngine.symbol);
  }

  /**
   * Constructs a new Node<T> instance with specified properties and position.
   * Updates the boundary in the positionRectStorage if necessary.
   * @param props - Partial properties and position for initialization.
   */
  constructor(positionRect: PositionRectProps = emptyPositionRect, props: Partial<T> = {}, runtime?: Container) {
    super();
    this.nodeKey = props.nodeKey ?? this.randomColorKey ?? `node:${Math.random().toString(36).slice(2)}`;
    this.positionRect = new PositionRect<RenderNodeKey>(
      positionRect.x,
      positionRect.y,
      positionRect.width,
      positionRect.height,
    );

    this.properties = props;
    this.depth = props.depth ?? 0;
    if (runtime) this.bindRuntime(runtime);
  }

  /** Binds this node tree to the editor-local services owned by one SceneGraph. */
  public bindRuntime(container: Container): void {
    if (this.#runtimeContainer && this.#runtimeContainer !== container) {
      throw new SearError('Render node is already bound to another editor runtime.');
    }
    if (this.#runtimeContainer === container) return;
    this.#runtimeContainer = container;

    const boundary = this.positionRectStorage.getBoundary();
    if (PositionRect.hasDominantAxisSpan(this.positionRect, boundary)) {
      this.positionRectStorage.updateBoundary(mergeSpatialBoundary(this.positionRect, boundary));
    }
    this.onRuntimeBound();
    for (const child of this.#childNodes.values()) {
      child.bindRuntime(container);
      this.#registerChild(child);
    }
  }

  /** Hook for subclasses that need editor-local services after scene attachment. */
  protected onRuntimeBound(): void {}

  /** Resolves one service from this node's editor-local runtime. */
  protected resolveRuntime<Service>(identifier: string | symbol): Service {
    if (!this.#runtimeContainer) throw new SearError(`${this.name} is not attached to a SceneGraph runtime.`);
    return this.#runtimeContainer.resolve<Service>(identifier);
  }

  /**
   * Provides access to the node data storage for hit detection and lookup.
   */
  protected get dataStorage() {
    return this.resolveRuntime<DataStorage<RenderNodeKey, Node<T>>>(DataStorage.symbol);
  }

  /** Provides access to hit-canvas color lookup storage. */
  protected get hitColorRegistry() {
    return this.resolveRuntime<HitColorRegistry>(HitColorRegistry.symbol);
  }

  /**
   * Provides access to the spatial tree for position-based queries.
   */
  protected get positionRectStorage() {
    return this.resolveRuntime<Tree<PositionRect<RenderNodeKey>>>(Tree.symbol);
  }

  /**
   * Adds one or more child nodes to this node.
   * Registers the child in the data storage and spatial tree.
   * @param child - The child node to add.
   * @returns The current node (for chaining).
   */
  public add(child: Node<T>): Node<T>;
  /** Adds multiple child nodes and returns this node for chaining. */
  public add(children: Node<T>[]): Node<T>;
  /** Implements the single-node and multiple-node add overloads. */
  public add(childOrChildren: Node<T> | Node<T>[]): Node<T> {
    const parent = this;
    function addChildNode(child: Node<T>): void {
      child.parentKey = parent.nodeKey;
      parent.childKeys.push(child.nodeKey);
      parent.#childNodes.set(child.nodeKey, child);
      if (parent.#runtimeContainer) {
        child.bindRuntime(parent.#runtimeContainer);
        parent.#registerChild(child);
      }
    }

    if (Array.isArray(childOrChildren)) {
      for (const child of childOrChildren) {
        addChildNode(child);
      }
    } else {
      addChildNode(childOrChildren);
    }
    return this;
  }

  /** Marks this node tree as sticky and applies the supplied affix axes to every descendant. */
  public setStickyTree(sticky: boolean, affix: Pick<NodeProperties, 'top' | 'left'> = {}): this {
    this.sticky = sticky;
    this.properties = { ...this.properties, ...affix };
    for (const child of this.#childNodes.values()) child.setStickyTree(sticky, affix);
    return this;
  }

  #registerChild(child: Node<T>): void {
    const { nodeKey, positionRect } = child;
    this.dataStorage.set(nodeKey, child);
    if (child.randomColorKey) this.hitColorRegistry.register(child.randomColorKey, child);
    positionRect.key = nodeKey;
    this.positionRectStorage.insert(positionRect);
  }

  /**
   * Disposes this node and all of its descendants recursively.
   * Removes nodes from DataStorage and positionRectStorage, and releases their hit color keys.
   */
  public dispose(): void {
    const nodes: Node<T>[] = [];
    const root = this;
    function collectDescendantNodes(node: Node<T>): void {
      nodes.push(node);
      for (const childKey of node.childKeys) {
        const childNode = root.dataStorage.get(childKey);
        if (childNode) {
          collectDescendantNodes(childNode);
        }
      }
    }

    collectDescendantNodes(this);

    for (const node of nodes) {
      node.onDisposed();
      const { nodeKey, positionRect, randomColorKey } = node;
      this.dataStorage.delete(nodeKey);
      this.positionRectStorage.remove(positionRect, (rect) => rect.key === nodeKey);
      if (randomColorKey) {
        this.hitColorRegistry.delete(randomColorKey);
        releaseColor(randomColorKey);
      }
    }
    this.childKeys.length = 0;
  }

  /** Hook for subclasses to release resources when removed with a parent node. */
  protected onDisposed(): void {}

  /**
   * Removes a child node from this node and disposes its entire subtree.
   */
  public removeChild(child: Node<T>): void {
    const key = child.nodeKey;
    const idx = this.childKeys.indexOf(key);
    if (idx !== -1) {
      this.childKeys.splice(idx, 1);
    }
    this.#childNodes.delete(key);
    child.dispose();
  }

  /** Clears state owned by Node. */
  public abstract clear(context: RenderContext): void;

  /**
   * Queries all nodes within a given rectangular range.
   * @param range - The rectangle to query.
   * @returns An array of nodes found within the range.
   */
  public query(range: PositionRect<HexColor>): Node<T>[] {
    const rects = this.positionRectStorage.query(range);
    return rects
      .map((rect) => {
        if (!rect.key) {
          this.warnThroughPlatform('Node.query skipped a stored PositionRect because its key is missing.', rect);
          return null;
        }
        return this.dataStorage.get(rect.key);
      })
      .filter((node): node is Node<T> => node !== void 0 && node !== null)
      .sort((a, b) => a.depth - b.depth);
  }

  /** Gets the x-coordinate of the node. */
  public get x(): number {
    return this.positionRect.x;
  }

  /** Gets the y-coordinate of the node. */
  public get y(): number {
    return this.positionRect.y;
  }

  /** Gets the width of the node. */
  public get width(): number {
    return this.positionRect.width;
  }
  /** Gets the height of the node. */
  public get height(): number {
    return this.positionRect.height;
  }

  /** The upper boundary of this node in parent coordinates. */
  public get top() {
    return this.properties.top;
  }
  /** The lower boundary of this node in parent coordinates. */
  public get bottom() {
    return this.properties.bottom;
  }
  /** The left boundary of this node in parent coordinates. */
  public get left() {
    return this.properties.left;
  }
  /** The right boundary of this node in parent coordinates. */
  public get right() {
    return this.properties.right;
  }
  /** Horizontal alignment used when positioning this node. */
  public get horizontalAlign() {
    return this.properties.horizontalAlign;
  }
  /** Vertical alignment used when positioning this node. */
  public get verticalAlign() {
    return this.properties.verticalAlign;
  }

  /** Gets or sets the stroke color of the node. */
  public get stroke(): string {
    return this.properties.stroke ?? '';
  }

  /** Stroke width used when painting this node. */
  public get strokeWidth(): number {
    return this.properties.strokeWidth ?? 0;
  }

  /** Dash pattern used when stroking this node. */
  public get lineDash(): number[] | undefined {
    return this.properties.lineDash;
  }

  /** Gets or sets the fill color of the node. */
  public get fill(): string {
    return this.properties.fill ?? '';
  }
  /** Fills the current path or exposes the node fill paint, depending on the render contract. */
  public set fill(value: string) {
    this.properties.fill = value;
  }

  /**
   * Adds an event listener for the specified event type.
   * @param type - The event type to listen for.
   * @param handler - The function to handle the event.
   */
  public addEventListener(type: string, handler: Function): void {
    this.on(type, handler);
  }

  /**
   * Removes an event listener for the specified event type.
   * @param type - The event type to remove.
   */
  public removeEventListener(type: string): void {
    this.off(type);
  }

  /**
   * Draws the node in both the scene and hit detection contexts.
   * @param sceneContext - The context for scene rendering.
   * @param hitContext - The context for hit detection rendering.
   */
  public draw(sceneContext: RenderContext, hitContext: RenderContext) {
    this.drawScene(sceneContext);
    this.drawHit(hitContext);
  }

  /**
   * Abstract method to draw the node's scene representation.
   * Must be implemented by subclasses.
   * @param context - The rendering context.
   * @param clipRegion - Optional clipping region: a `PositionRect` for axis-aligned rectangular clip,
   *                     or a `Point[]` polygon (array of `[x, y]` vertices) for arbitrary shape clip.
   */
  public abstract drawScene(context: RenderContext, clipRegion?: ClipRegion): void;

  /**
   * Abstract method to draw the node's hit detection representation.
   * Must be implemented by subclasses.
   * @param context - The rendering context.
   */
  public abstract drawHit(context: RenderContext): void;

  /**
   * Converts the node and its properties to a JSON object.
   * Can be extended to recursively serialize children.
   */
  public toJSON() {
    return {};
    // return {
    //     type: this.constructor.name,
    //     rect: this.rect.toJSON(),
    //     children: this.children.map(child => child.toJSON()),
    // };
  }

  /**
   * Finds a node by its random color key.
   * @param key - The random color key to search for.
   * @returns The node if found, otherwise null.
   */
  public getNodeByRandomColorKey(key: HitColorKey) {
    return this.hitColorRegistry.get<T>(key) || null;
  }

  /**
   * Finds a node by its stable render-node key.
   * @param key - The stable render node key.
   * @returns The node if found, otherwise null.
   */
  public getNodeByNodeKey(key: RenderNodeKey) {
    return this.dataStorage.get(key) || null;
  }

  /** Emits a warning through this node's editor-local platform when available. */
  protected warnThroughPlatform(message: string, ...details: unknown[]): void {
    try {
      this.resolveRuntime<Platform>(Platform.symbol).warn(message, ...details);
    } catch (_error) {
      // Detached render-node tests may instantiate nodes without assembling a platform.
    }
  }
}

function mergeSpatialBoundary(
  rect: PositionRect<RenderNodeKey>,
  boundary: PositionRect<HexColor>,
): PositionRect<HexColor> {
  const left = Math.min(rect.x, boundary.x);
  const top = Math.min(rect.y, boundary.y);
  const right = Math.max(rect.x + rect.width, boundary.x + boundary.width);
  const bottom = Math.max(rect.y + rect.height, boundary.y + boundary.height);
  return new PositionRect<HexColor>(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}
