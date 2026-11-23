import { getRandomColor, resetColorPool } from '../src/getRandomColor';

describe('getRandomColor exhaustion', () => {
  it('returns null when all colors are exhausted', () => {
    resetColorPool();
    const origRandom = Math.random;
    let mockRandom = 0;
    Math.random = () => {
      const val = mockRandom;
      mockRandom += 1 / 16777216;
      return val;
    };

    // We can just call it 16777216 times.
    for (let i = 0; i < 16777216; i++) {
      getRandomColor();
    }

    expect(getRandomColor()).toBeNull();

    Math.random = origRandom;
  });
});
