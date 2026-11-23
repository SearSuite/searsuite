import { PositionRect } from '@searsuite/sear-foundation-rect';
import type { HexColor } from '@searsuite/sear-foundation-utils';
import { GenerationalDirtyTracker } from '../src/GenerationalDirtyTracker';
import { QuadTree } from '../src/QuadTree';

describe('GenerationalDirtyTracker', () => {
  it('retains every scene mutation until the frame is consumed, including overlapping regions', () => {
    const tree = new QuadTree(new PositionRect<HexColor>(0, 0, 0, 0), 16);
    const tracker = new GenerationalDirtyTracker(tree);
    const removedNodeRect = new PositionRect<HexColor>(80, 40, 120, 60);
    const replacementNodeRect = new PositionRect<HexColor>(160, 70, 120, 60);

    tracker.mark(removedNodeRect);
    tracker.mark(replacementNodeRect);

    const dirtyRects = tracker.query(tracker.getBoundary());
    expect(dirtyRects).toEqual(expect.arrayContaining([removedNodeRect, replacementNodeRect]));

    tracker.clear();
    expect(tracker.query(tracker.getBoundary())).toEqual([]);
  });
});
