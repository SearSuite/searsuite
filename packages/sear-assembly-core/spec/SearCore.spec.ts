import { SearCore } from '../src';

describe('SearCore', () => {
  it('uses a stable DI token for host-specific core implementations', () => {
    expect(SearCore.symbol).toBe(Symbol.for('SearCore'));
  });
});
