import { extendSelection } from '../../src/selection/ExtendSelectionCommand';

describe('ExtendSelectionCommand', () => {
  const baseInput = {
    origin: [2, 2] as [number, number],
    cursor: [2, 2] as [number, number],
    lastRow: 10,
    lastCol: 10,
    findMerge: () => undefined,
  };

  it('should extend up', () => {
    const res = extendSelection({ ...baseInput, direction: 'up' });
    expect(res.cursor).toEqual([1, 2]);
  });

  it('should extend down', () => {
    const res = extendSelection({ ...baseInput, direction: 'down' });
    expect(res.cursor).toEqual([3, 2]);
  });

  it('should extend left', () => {
    const res = extendSelection({ ...baseInput, direction: 'left' });
    expect(res.cursor).toEqual([2, 1]);
  });

  it('should extend right', () => {
    const res = extendSelection({ ...baseInput, direction: 'right' });
    expect(res.cursor).toEqual([2, 3]);
  });

  it('should jump up', () => {
    const res = extendSelection({ ...baseInput, direction: 'up', jumpToEdge: true });
    expect(res.cursor).toEqual([0, 2]);
  });

  it('should jump down', () => {
    const res = extendSelection({ ...baseInput, direction: 'down', jumpToEdge: true });
    expect(res.cursor).toEqual([10, 2]);
  });

  it('should jump left', () => {
    const res = extendSelection({ ...baseInput, direction: 'left', jumpToEdge: true });
    expect(res.cursor).toEqual([2, 0]);
  });

  it('should jump right', () => {
    const res = extendSelection({ ...baseInput, direction: 'right', jumpToEdge: true });
    expect(res.cursor).toEqual([2, 10]);
  });

  it('should not go below 0 row', () => {
    const res = extendSelection({ ...baseInput, cursor: [0, 2], direction: 'up' });
    expect(res.cursor).toEqual([0, 2]);
  });

  it('should not go above lastRow', () => {
    const res = extendSelection({ ...baseInput, cursor: [10, 2], direction: 'down' });
    expect(res.cursor).toEqual([10, 2]);
  });

  it('should not go below 0 col', () => {
    const res = extendSelection({ ...baseInput, cursor: [2, 0], direction: 'left' });
    expect(res.cursor).toEqual([2, 0]);
  });

  it('should not go above lastCol', () => {
    const res = extendSelection({ ...baseInput, cursor: [2, 10], direction: 'right' });
    expect(res.cursor).toEqual([2, 10]);
  });
});
