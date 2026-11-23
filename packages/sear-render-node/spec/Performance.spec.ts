import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';

import { QuadTree } from '../src';

describe('QuadTree workload regression', () => {
  it('returns the same matches as a linear intersection scan after repeated subdivision', () => {
    const boundary = new PositionRect<HexColor>(0, 0, 128, 128);
    const tree = new QuadTree(boundary, 4);
    const rects = Array.from({ length: 256 }, (_, index) => {
      const x = (index * 17) % 120;
      const y = (index * 31) % 120;
      return new PositionRect<HexColor>(x, y, 8, 8);
    });
    const query = new PositionRect<HexColor>(32, 32, 48, 48);

    for (const rect of rects) {
      expect(tree.insert(rect)).toBe(true);
    }

    const expected = rects.filter((rect) => PositionRect.intersection(query, rect));

    expect(tree.query(query)).toEqual(expect.arrayContaining(expected));
    expect(tree.query(query)).toHaveLength(expected.length);
  });
});
