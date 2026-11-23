import { BaseOT, OTTransformPriority } from '../src/BaseOT';
import { SearError } from '@searsuite/sear-foundation-error';

describe('BaseOT', () => {
  class TestOT extends BaseOT {
    constructor() {
      super('TestOT');
    }
  }

  it('constructor sets name', () => {
    const ot = new TestOT();
    expect(ot.name).toBe('TestOT');
  });

  it('create clones or returns empty array', () => {
    expect(TestOT.create()).toEqual([]);
    const op = [{ p: [1] }];
    const created = TestOT.create(op);
    expect(created).toEqual(op);
    expect(created).not.toBe(op);
  });

  it('checkValidOp throws if path is missing', () => {
    expect(() => TestOT.checkValidOp([{}] as any)).toThrow(SearError);
    expect(() => TestOT.checkValidOp([{ p: [] }])).not.toThrow();
  });

  it('apply rejects calls on the abstract base class', () => {
    expect(() => TestOT.apply({}, [])).toThrow('BaseOT.apply must be implemented by concrete OT classes.');
  });

  it('append rejects calls on the abstract base class', () => {
    expect(() => TestOT.append([], {} as any)).toThrow('BaseOT.append must be implemented by concrete OT classes.');
  });

  it('compose rejects calls on the abstract base class', () => {
    expect(() => TestOT.compose([], [])).toThrow('BaseOT.compose must be implemented by concrete OT classes.');
  });

  it('transform rejects calls on the abstract base class', () => {
    expect(() => TestOT.transform([], [], OTTransformPriority.LEFT)).toThrow(
      'BaseOT.transform must be implemented by concrete OT classes.',
    );
  });
});
