import { SearError } from '@searsuite/sear-foundation-error';

import { HexColor, getRandomColor } from '@searsuite/sear-foundation-utils';

import { EventListener } from './EventListener';

/** Scene node that owns, queries, and serializes an ordered child collection. */
export class Container extends EventListener<string> {
  /** Unique random color key for hit detection. */
  public readonly randomColorKey: HexColor | null = getRandomColor();

  #childrenKeys: Set<HexColor> = new Set();
  /** The direct scene children in paint order. */
  public get children(): HexColor[] {
    return [];
  }

  /** Creates a Container instance. */
  constructor() {
    super();
    if (!this.randomColorKey) {
      throw new SearError('Failed to generate a random color key for the container.');
    }

    // this.layoutTree = treeFactory.createTree(new PositionRect(0, 0, 0, 0), 4);
  }

  /** Iterates every descendant in scene order. */
  public descendants() {
    return [];
  }

  /** Adds the value. */
  public add(child: Container): this;
  /** Adds the value. */
  public add(children: Container[]): this;
  /** Adds the value. */
  public add(childOrChildren: Container | Container[]): this {
    throw new SearError('Container.add must be implemented by concrete container classes.');
  }

  /** Removes the value. */
  remove() {}
  /** Returns descendants whose boundaries intersect the supplied rectangle. */
  query() {}
  /** Updates the indexed boundary after geometry changes. */
  updateBoundary() {}

  /** Serializes this scene structure into diagnostic JSON. */
  public toJSON() {
    return {};
  }
}
