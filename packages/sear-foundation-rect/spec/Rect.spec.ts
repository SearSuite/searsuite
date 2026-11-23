import { Rect, createEmptyRect, createEmptyRectShape } from '../src';
import { defaultRect } from '../src/Rect';

describe('Rect', () => {
  it('copies the shared empty sentinel for default construction', () => {
    const rect = new Rect();

    expect(Rect.Empty).toBe(defaultRect);
    expect(rect.shape).toEqual(defaultRect);
    expect(rect.shape).not.toBe(defaultRect);
    expect(rect.toJSON()).toEqual({
      rect: [
        [-1, -1],
        [-1, -1],
      ],
    });
  });

  it('creates fresh empty rect shapes and instances', () => {
    const shape = createEmptyRectShape();
    const rect = createEmptyRect();

    expect(shape).toEqual(defaultRect);
    expect(shape).not.toBe(defaultRect);
    expect(rect.shape).toEqual(defaultRect);
    expect(rect.shape).not.toBe(defaultRect);
  });

  it('locks retained coordinates while keeping transaction clones writable', () => {
    const rect = new Rect([[1, 2], [3, 4]]);
    const point = rect.getPoint(0);
    rect.lockMutations();

    expect(() => { point[0] = 9; }).toThrow();
    expect(() => { rect.shape[1][1] = 9; }).toThrow();
    expect(() => rect.update([[5, 6], [7, 8]])).toThrow();
    expect(rect.shape).toEqual([[1, 2], [3, 4]]);

    const staged = rect.clone();
    staged.update([[5, 6], [7, 8]]);
    expect(staged.shape).toEqual([[5, 6], [7, 8]]);

    const empty = new Rect();
    empty.lockMutations();
    expect(empty.shape).not.toBe(defaultRect);
    expect(Object.isFrozen(defaultRect)).toBe(true);
    expect(() => { defaultRect[0][0] = 9; }).toThrow();
  });

  it('snapshots dynamic coordinates even when the rectangle was frozen first', () => {
    let coordinate = 1;
    const point = [1, 2] as [number, number];
    Object.defineProperty(point, 0, { get: () => coordinate, configurable: true });
    const rect = Object.freeze(new Rect([point, [3, 4]]));

    rect.lockMutations();
    coordinate = 9;

    expect(rect.getPoint(0)).toEqual([1, 2]);
    expect(rect.shape).toEqual([[1, 2], [3, 4]]);
    expect(rect.toJSON().rect).toEqual([[1, 2], [3, 4]]);
    expect(rect.clone().shape).toEqual([[1, 2], [3, 4]]);
  });

  it('rejects non-primitive committed coordinates', () => {
    const external = { value: 1 };
    const coordinate = { valueOf: () => external.value } as unknown as number;
    const rect = new Rect([[coordinate, 0], [2, 2]]);

    expect(() => rect.lockMutations()).toThrow('safe integers');
  });

  it('iterates every selected cell in row-major order', () => {
    const selection = new Rect([
      [2, 4],
      [3, 6],
    ]);
    const visited: Array<[number, number]> = [];

    selection.forEach((rowIndex, colIndex) => {
      visited.push([rowIndex, colIndex]);
    });

    expect(visited).toEqual([
      [2, 4],
      [2, 5],
      [2, 6],
      [3, 4],
      [3, 5],
      [3, 6],
    ]);
  });

  it('adapts a selected block through row and column insertions and deletions', () => {
    const selection = new Rect([
      [2, 2],
      [4, 5],
    ]);

    selection.addRow(1);
    expect(selection.shape).toEqual([
      [3, 2],
      [5, 5],
    ]);

    selection.addRow(4);
    expect(selection.shape).toEqual([
      [3, 2],
      [6, 5],
    ]);

    selection.addRow(10);
    expect(selection.shape).toEqual([
      [3, 2],
      [6, 5],
    ]);

    selection.removeRow(1);
    expect(selection.shape).toEqual([
      [2, 2],
      [5, 5],
    ]);

    selection.removeRow(4);
    expect(selection.shape).toEqual([
      [2, 2],
      [4, 5],
    ]);

    selection.removeRow(20);
    expect(selection.shape).toEqual([
      [2, 2],
      [4, 5],
    ]);

    selection.addCol(1);
    expect(selection.shape).toEqual([
      [2, 3],
      [4, 6],
    ]);

    selection.addCol(4);
    expect(selection.shape).toEqual([
      [2, 3],
      [4, 7],
    ]);

    selection.addCol(20);
    expect(selection.shape).toEqual([
      [2, 3],
      [4, 7],
    ]);

    selection.removeCol(1);
    expect(selection.shape).toEqual([
      [2, 2],
      [4, 6],
    ]);

    selection.removeCol(3);
    expect(selection.shape).toEqual([
      [2, 2],
      [4, 5],
    ]);

    selection.removeCol(20);
    expect(selection.shape).toEqual([
      [2, 2],
      [4, 5],
    ]);
  });

  it('expands when insertion happens before the last row or column', () => {
    const selection = new Rect([[1, 1], [2, 2]]);
    selection.addRow(2);
    expect(selection.shape).toEqual([[1, 1], [3, 2]]);
    selection.addCol(2);
    expect(selection.shape).toEqual([[1, 1], [3, 3]]);
  });

  it('supports replacing bounds, containment checks, and bounding-box aggregation', () => {
    const selection = new Rect([
      [5, 5],
      [5, 5],
    ]);
    const nested = new Rect([
      [2, 3],
      [4, 4],
    ]);
    const sibling = new Rect([
      [0, 1],
      [1, 2],
    ]);
    const footer = new Rect([
      [6, 0],
      [7, 1],
    ]);

    expect(
      selection.update([
        [1, 2],
        [4, 4],
      ]),
    ).toBe(selection);
    expect(selection.getPoint(0)).toEqual([1, 2]);
    expect(selection.getPoint(1)).toEqual([4, 4]);

    expect(Rect.contains(selection, nested)).toBe(true);
    expect(Rect.contains(selection, footer)).toBe(false);

    expect(Rect.findBoundingRectangle([selection, sibling, footer]).shape).toEqual([
      [0, 0],
      [7, 4],
    ]);
  });
});
