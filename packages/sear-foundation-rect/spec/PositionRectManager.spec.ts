import { PositionRect, PositionRectManager } from '../src';

describe('PositionRectManager', () => {
  it('stores tracked overlay rectangles', () => {
    const positionRectManager = new PositionRectManager<string>();
    const positionRect = new PositionRect<string>(0, 0, 500, 500);
    positionRect.key = 'main-selection';

    positionRectManager.addPositionRect(positionRect);

    expect(positionRectManager.length).toEqual(1);
    expect(positionRect.toJSON().key).toEqual('main-selection');
  });
  it('updates all overlay fragments together while preserving their dimensions', () => {
    const positionRectManager = new PositionRectManager<string>();

    const positionRectOne = new PositionRect<string>(0, 0, 500, 500);
    const positionRectTwo = new PositionRect<string>(0, 0, 800, 800);
    const positionRectThree = new PositionRect<string>(50, 80, 120, 20);

    positionRectManager.addPositionRect(positionRectOne);
    positionRectManager.addPositionRect(positionRectTwo);
    positionRectManager.addPositionRect(positionRectThree);

    positionRectManager.updatePosition(100, 100);

    expect(positionRectOne.getBounds()).toEqual([100, 600, 100, 600]);
    expect(positionRectTwo.getBounds()).toEqual([100, 900, 100, 900]);
    expect(positionRectThree.getBounds()).toEqual([100, 220, 100, 120]);
  });

  it('handles synchronized moves on an empty manager without failing', () => {
    const positionRectManager = new PositionRectManager();

    positionRectManager.updatePosition(10, 20);

    expect(positionRectManager.length).toEqual(0);
  });
});
