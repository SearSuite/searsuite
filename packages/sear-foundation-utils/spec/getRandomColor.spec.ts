import { getRandomColor, releaseColor } from '../src';
import { getColorPoolStats, resetColorPool } from '../src/getRandomColor';

describe('color pool', () => {
  beforeEach(() => {
    resetColorPool();
  });

  it('allocates unique padded hex colors, releases them, and reports usage', () => {
    const random = jest.spyOn(Math, 'random');
    random.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.5);

    const first = getRandomColor();
    const second = getRandomColor();

    expect(first).toBe('#000000');
    expect(second).toBe('#800000');
    expect(getColorPoolStats()).toMatchObject({
      available: 0xffffff - 1,
      total: 0x1000000,
    });
    expect(getColorPoolStats().usagePercentage).toBeGreaterThan(0);
    expect(releaseColor(first!)).toBe(true);
    expect(releaseColor(first!)).toBe(false);
    expect(releaseColor('#ffffff')).toBe(false);
    expect(releaseColor('#1000000' as '#1000000')).toBe(false);

    resetColorPool();
    expect(getColorPoolStats()).toEqual({
      available: 0x1000000,
      total: 0x1000000,
      usagePercentage: 0,
    });
    random.mockRestore();
  });
});
