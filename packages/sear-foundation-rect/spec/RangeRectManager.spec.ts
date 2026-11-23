import { RangeRectManager, RangeRect } from '../src';

describe('RangeRectManager', () => {
  it('stores independent formatting layers', () => {
    const rangeMan = new RangeRectManager<{ background?: string }>();
    const rect: [number, number, number, number] = [0, 3, 0, 3];
    const value = { background: '#329FD9' };
    const rangeRect = new RangeRect(rect, value);

    rangeMan.addRange(rangeRect);

    expect(rangeMan.length).toEqual(1);
  });
  it('merges overlapping range payloads in insertion order like layered cell styles', () => {
    const rangeMan = new RangeRectManager<{
      background?: string;
      color?: string;
      border?: string;
    }>();
    const rect: [number, number, number, number] = [0, 3, 0, 3];
    const value = { background: '#329FD9' };
    const rangeRect = new RangeRect(rect, value);

    rangeMan.addRange(rangeRect);
    const rect2: [number, number, number, number] = [3, 6, 3, 6];
    const value2 = { color: '#329FD9' };
    const rangeRect2 = new RangeRect(rect2, value2);
    rangeMan.addRange(rangeRect2);

    const rect3: [number, number, number, number] = [2, 4, 2, 4];
    const value3 = { background: '#101820', border: '1px solid #101820' };
    const rangeRect3 = new RangeRect(rect3, value3);
    rangeMan.addRange(rangeRect3);

    expect(rangeMan.getValue(3, 3)).toEqual({
      color: '#329FD9',
      background: '#101820',
      border: '1px solid #101820',
    });

    expect(rangeMan.getValue(1, 1)).toEqual({
      background: '#329FD9',
    });
  });
  it('returns null when a cell is outside every registered range', () => {
    const rangeMan = new RangeRectManager<Record<string, string>>();

    expect(rangeMan.getValue(3, 3)).toEqual(null);
  });

  it('serializes the managed ranges in insertion order', () => {
    const rangeMan = new RangeRectManager<{ color: string }>();
    const rect: [number, number, number, number] = [3, 6, 3, 6];
    const value = { color: '#329FD9' };
    const rangeRect = new RangeRect(rect, value);

    rangeMan.addRange(rangeRect);
    rangeMan.addRange(rangeRect);
    expect(rangeMan.toJSON()).toEqual([
      { rect, value },
      { rect, value },
    ]);
  });
});
