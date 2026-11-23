import { PositionRect, emptyPositionRect } from '../src';

describe('PositionRect', () => {
  let rect: PositionRect<string>;

  beforeEach(() => {
    rect = new PositionRect(10, 20, 30, 40);
    rect.key = 'selection-overlay';
  });

  test('should initialize with correct position and size', () => {
    expect(rect.getPosition()).toEqual([10, 20]);
    expect(rect.getSize()).toEqual([30, 40]);
    expect(emptyPositionRect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  test('should update position correctly', () => {
    rect.updatePosition(50, 60);
    expect(rect.getPosition()).toEqual([50, 60]);
  });

  test('should return correct bounds', () => {
    expect(rect.getBounds()).toEqual([10, 40, 20, 60]);
    rect.updatePosition(50, 60);
    expect(rect.getBounds()).toEqual([50, 80, 60, 100]);
  });

  test('supports realistic overlay hit-testing and serialization', () => {
    expect(rect.inRect(10, 20)).toBe(true);
    expect(rect.inRect(40, 60)).toBe(true);
    expect(rect.inRect(41, 60)).toBe(false);
    expect(rect.inRect(40, 61)).toBe(false);

    expect(rect.toJSON()).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      key: 'selection-overlay',
    });
  });

  test('merges overlapping widgets and distinguishes overlap edge cases', () => {
    const frozenPane = new PositionRect(0, 0, 120, 40);
    const viewportSelection = new PositionRect(80, 10, 100, 80);
    const touchingWidget = new PositionRect(180, 10, 40, 30);
    const tallerWidget = new PositionRect(60, 0, 50, 120);
    const compactWidget = new PositionRect(60, 0, 50, 60);

    expect(PositionRect.merge(frozenPane, viewportSelection).toJSON()).toEqual({
      x: 0,
      y: 0,
      width: 180,
      height: 90,
      key: void 0,
    });

    expect(PositionRect.intersection(frozenPane, viewportSelection)).toBe(true);
    expect(PositionRect.intersection(viewportSelection, touchingWidget)).toBe(false);
    expect(PositionRect.hasDominantAxisSpan(tallerWidget, compactWidget)).toBe(true);
    expect(PositionRect.hasDominantAxisSpan(compactWidget, tallerWidget)).toBe(false);
  });
});
