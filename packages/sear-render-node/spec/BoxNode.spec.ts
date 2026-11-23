import { BoxNode } from '../src/BoxNode';
import { SearError } from '@searsuite/sear-foundation-error';
import { Container, Injectable } from '@searsuite/sear-foundation-di';

let container: Container;

@Injectable()
class FakeTree {
  add() {}
  remove() {}
  getBoundary() {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  updateBoundary() {}
}
@Injectable()
class FakeConfig {
  get() {
    return {};
  }
}
@Injectable()
class FakeDataStorage {
  get() {
    return null;
  }
}

describe('BoxNode', () => {
  beforeEach(() => {
    container = new Container();
    container.register(Symbol.for('Tree'), FakeTree);
    container.register(Symbol.for('ConfigEngine'), FakeConfig);
    container.register(Symbol.for('DataStorage'), FakeDataStorage);
  });

  it('clear throws NotImplemented error', () => {
    const node = new BoxNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    expect(() => node.clear({} as any)).toThrow(SearError);
  });

  it('drawScene and drawHit are no-ops', () => {
    const node = new BoxNode({ x: 0, y: 0, width: 10, height: 10 }, {});
    expect(() => node.drawScene({} as any)).not.toThrow();
    expect(() => node.drawHit({} as any)).not.toThrow();
  });
});
