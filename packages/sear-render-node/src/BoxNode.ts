import { SearError } from '@searsuite/sear-foundation-error';
import { Node } from './Node';
import { LayoutNode } from './LayoutNode';
import { RenderContext } from '@searsuite/sear-render-context';
import { NodeProperties } from './types';

/**
 * The BoxNode class represents a block-level node in a scene graph.
 * It behaves similarly to an HTML element with `position: relative`,
 * where its position is determined relative to its parent or siblings.
 */
export class BoxNode<T extends NodeProperties> extends LayoutNode<T> {
  /** Clears state owned by BoxNode. */
  public clear(context: RenderContext): void {
    throw new SearError('BoxNode.clear must be implemented by concrete layout node classes.');
  }
  // protected override needUpdateBoundary = true;

  /**
   * Constructs a new BoxNode instance with optional properties.
   * @param props - Partial properties to initialize the node.
   */
  // constructor(props: Partial<NodeProperties> = {}) {
  //     super(props);
  // }

  /**
   * Gets the x-coordinate of the node.
   * If there is a previous sibling and it is a BoxNode, this node's x-coordinate
   * is calculated as the right edge (x + width) of the previous sibling,
   * positioning this node immediately to the right of it.
   * If there is no previous sibling, the node's own x property is used.
   */
  // public override get x(): number {
  //     // const previousSibling = this.getPreviousSibling();
  //     // if (previousSibling && previousSibling instanceof BoxNode) {
  //     //     const boundingClientRect = previousSibling.getBoundingClientRect();
  //     //     return boundingClientRect.x + boundingClientRect.width;
  //     // } else if (this.parent && this.parent instanceof LayoutNode) {
  //     //     // If the parent is a LayoutNode, use its x as the base
  //     //     return this.parent.x + this.properties.x;
  //     // }
  //     return this.properties.x;
  // }

  /**
   * Gets the y-coordinate of the node.
   * If the node has a previous sibling, its y-coordinate is calculated
   * based on the sibling's bounding rectangle (stacked vertically).
   * Otherwise, it uses its own y property.
   */
  // public override get y(): number {
  //     const previousSibling = this.getPreviousSibling();
  //     if (previousSibling && previousSibling instanceof BoxNode) {
  //         const boundingClientRect = previousSibling.getBoundingClientRect();
  //         return boundingClientRect.y + boundingClientRect.height;
  //     }
  //     return this.properties.y;
  // }

  /**
   * Retrieves the bounding rectangle of the node.
   * The rectangle includes the x and y coordinates, as well as the width and height of the node.
   * These values are derived from the node's properties or its parent if not explicitly set.
   *
   * @returns An object representing the bounding rectangle of the node:
   * - `x`: The x-coordinate of the node.
   * - `y`: The y-coordinate of the node.
   * - `width`: The width of the node.
   * - `height`: The height of the node.
   */
  // public override getBoundingClientRect = () => {
  //     return {
  //         x: this.x,
  //         y: this.y,
  //         width: this.width,
  //         height: this.height,
  //     };
  // };

  /**
   * Draws the scene for this node and all its descendants.
   * This method recursively calls `drawScene` on all child nodes.
   * @param context - The rendering context used to draw the scene.
   */
  public drawScene(context: RenderContext): void {
    // this.descendants((child) => {
    //     (child as Node).drawScene(context);
    //     return true;
    // });
  }

  /**
   * Draws the hit area for this node and all its descendants.
   * This is typically used for hit testing (e.g., detecting mouse clicks).
   * @param context - The rendering context used to draw the hit area.
   */
  public drawHit(context: RenderContext): void {
    // this.descendants((child) => {
    //     (child as Node).drawHit(context);
    //     return true;
    // });
  }
}
