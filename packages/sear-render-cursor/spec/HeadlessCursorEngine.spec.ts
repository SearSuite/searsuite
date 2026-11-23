import { HeadlessCursorEngine } from '../src/HeadlessCursorEngine';
import { CursorToken } from '../src/CursorToken';

describe('HeadlessCursorEngine', () => {
  it('accepts the complete cursor lifecycle without requiring a render target', () => {
    const engine = new HeadlessCursorEngine();

    expect(engine.mount({})).toBe(void 0);
    expect(engine.apply(CursorToken.Text)).toBe(void 0);
    expect(engine.override(CursorToken.Cell)).toBe(void 0);
    expect(engine.override(null)).toBe(void 0);
    expect(engine.unmount()).toBe(void 0);
  });
});
