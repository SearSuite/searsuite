import { erf, erfc } from '../src';

describe('real error functions', () => {
  it.each([
    [0, 0, 1],
    [0.745, 0.7079289200957377, 0.2920710799042623],
    [1, 0.8427007929497148, 0.15729920705028513],
    [3, 0.9999779095030014, 0.00002209049699858544],
    [5, 0.9999999999984626, 1.5374597944280351e-12],
    [10, 1, 2.088487583762545e-45],
  ])('matches independent references at x=%s', (input, expectedErf, expectedErfc) => {
    expect(Math.abs(erf(input) - expectedErf)).toBeLessThanOrEqual(2e-15);
    expect(Math.abs(erfc(input) / expectedErfc - 1)).toBeLessThanOrEqual(2e-14);
    expect(erf(-input)).toBeCloseTo(-expectedErf, 14);
  });

  it('handles infinities and preserves small negative-tail probabilities', () => {
    expect(erf(Infinity)).toBe(1);
    expect(erf(-Infinity)).toBe(-1);
    expect(erfc(Infinity)).toBe(0);
    expect(erfc(-Infinity)).toBe(2);
    expect(erfc(6)).toBeGreaterThan(0);
    expect(Number.isNaN(erf(NaN))).toBe(true);
  });
});
