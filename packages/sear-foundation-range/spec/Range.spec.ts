import { Range } from '../src';

describe('', () => {
  it('Range should support initialization from a legal range string', () => {
    const range = new Range('A1:AMY2');
    expect(range.range).toEqual([
      [1, 1],
      [1039, 2],
    ]);
    expect(range.shape).toEqual([1039, 2]);
  });
  it('Range should support convert to a range string', () => {
    const range = new Range('A1:AMY2');
    expect(range.toString()).toEqual('A1:AMY2');
  });
  it('Range should support check contains', () => {
    const range = new Range('A1:AMY2');
    expect(range.contains(3, 10)).toEqual(false);
  });
  it('Range should throw error from a illegal range string', () => {
    const rangeString = 'A1AMY2';
    const errorString = "Invalid range format. Expected format 'A1:B2'.";
    expect(() => new Range(rangeString)).toThrow(errorString);
  });
  it('Range should throw error from a Invalid range', () => {
    const rangeString = 'B1:A1';
    const errorString = 'Invalid range: Start must be less than or equal to end.';
    expect(() => new Range(rangeString)).toThrow(errorString);
  });
});
