import { RangeRect } from '../src';

describe('RangeRect', () => {
  it('constructs a range-backed style block', () => {
    const rect: [number, number, number, number] = [0, 3, 0, 3];
    const value = {
      background: '#329FD9',
    };
    const rangeRect = new RangeRect(rect, value);

    expect(rangeRect.shape).toEqual(rect);
  });

  it('returns the payload only for cells inside the range', () => {
    const rect: [number, number, number, number] = [0, 3, 0, 3];
    const value = {
      background: '#329FD9',
    };
    const rangeRect = new RangeRect(rect, value);

    expect(rangeRect.getValue(2, 2)).toEqual(value);
    expect(rangeRect.getValue(20, 20)).toEqual(null);
  });

  it('reflows formatting ranges through row and column structure changes', () => {
    const rect: [number, number, number, number] = [0, 3, 0, 3];
    const value = {
      background: '#329FD9',
    };
    const rangeRect = new RangeRect(rect, value);

    rangeRect.addRow(2);
    expect(rangeRect.shape).toEqual([0, 4, 0, 3]);

    rangeRect.removeRow(2);
    expect(rangeRect.shape).toEqual([0, 3, 0, 3]);

    rangeRect.removeRow(5);
    expect(rangeRect.shape).toEqual([0, 3, 0, 3]);

    rangeRect.addRow(0);
    expect(rangeRect.shape).toEqual([0, 3, 0, 3]);

    rangeRect.addCol(2);
    expect(rangeRect.shape).toEqual([0, 3, 0, 4]);

    rangeRect.removeCol(2);
    expect(rangeRect.shape).toEqual([0, 3, 0, 3]);

    rangeRect.addCol(0);
    expect(rangeRect.shape).toEqual([0, 3, 0, 3]);

    rangeRect.removeCol(5);
    expect(rangeRect.shape).toEqual([0, 3, 0, 3]);
  });

  it('iterates every covered cell in a realistic merged-style region', () => {
    const rect: [number, number, number, number] = [0, 3, 0, 3];
    const value = {
      background: '#329FD9',
    };
    const rangeRect = new RangeRect(rect, value);

    const expectedValues = [
      { rowIndex: 0, colIndex: 0, value: value },
      { rowIndex: 0, colIndex: 1, value: value },
      { rowIndex: 0, colIndex: 2, value: value },
      { rowIndex: 0, colIndex: 3, value: value },
      { rowIndex: 1, colIndex: 0, value: value },
      { rowIndex: 1, colIndex: 1, value: value },
      { rowIndex: 1, colIndex: 2, value: value },
      { rowIndex: 1, colIndex: 3, value: value },
      { rowIndex: 2, colIndex: 0, value: value },
      { rowIndex: 2, colIndex: 1, value: value },
      { rowIndex: 2, colIndex: 2, value: value },
      { rowIndex: 2, colIndex: 3, value: value },
      { rowIndex: 3, colIndex: 0, value: value },
      { rowIndex: 3, colIndex: 1, value: value },
      { rowIndex: 3, colIndex: 2, value: value },
      { rowIndex: 3, colIndex: 3, value: value },
    ];

    const result: {
      value: typeof value;
      rowIndex: number;
      colIndex: number;
    }[] = [];

    rangeRect.forEach((rowIndex, colIndex, value) => {
      result.push({ rowIndex, colIndex, value });
    });

    expect(result).toEqual(expectedValues);
  });

  it('serializes the covered area and payload', () => {
    const rect: [number, number, number, number] = [0, 3, 0, 3];
    const value = {
      background: '#329FD9',
    };
    const rangeRect = new RangeRect(rect, value);
    expect(rangeRect.toJSON()).toEqual({
      rect: [0, 3, 0, 3],
      value: value,
    });
  });

  it('clones the range bounds without cloning the payload reference', () => {
    const value = {
      background: '#329FD9',
    };
    const rangeRect = new RangeRect([0, 3, 0, 3], value);
    const clone = rangeRect.clone();

    rangeRect.addRow(2);

    expect(clone).toBeInstanceOf(RangeRect);
    expect(clone.shape).toEqual([0, 3, 0, 3]);
    expect(clone.value).toBe(value);
  });
});
