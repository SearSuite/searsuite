import { Injectable } from '@searsuite/sear-foundation-di';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { QuadTree } from './QuadTree';
import { TreeFactory } from './Tree';

/** Factory that creates QuadTree spatial indexes for rectangular scene data. */
@Injectable()
export class QuadTreeFactory<T> implements TreeFactory<PositionRect<HexColor>> {
  /**
   * Creates a QuadTree.
   * @param boundary - Root spatial boundary.
   * @param capacity - Maximum items in a leaf before subdivision.
   */
  create(boundary: PositionRect<HexColor>, capacity: number) {
    return new QuadTree(boundary, capacity);
  }
}
