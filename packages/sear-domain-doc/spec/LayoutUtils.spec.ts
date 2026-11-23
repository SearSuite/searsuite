import { computeFirstBaselineY } from '../src';

describe('document layout utilities', () => {
  it('computes a padded first-line baseline with and without an absolute offset', () => {
    expect(computeFirstBaselineY(40, 4, 10, 14)).toBe(23);
    expect(computeFirstBaselineY(40, 4, 10, 14, 100)).toBe(123);
  });
});
