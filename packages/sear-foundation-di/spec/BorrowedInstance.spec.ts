import { Container, Inject, Injectable, Scope } from '../src';

@Injectable()
class Borrower {
  public constructor(@Inject('shared') public readonly shared: object) {}
}

describe('borrowed DI instance ownership', () => {
  it('resolves an identical shared instance without disposing it when a child resets', () => {
    const parent = new Container();
    const child = new Container();
    const shared = { destroy: jest.fn() };
    parent.registerInstance('shared', shared);
    child.registerBorrowedInstance('shared', parent.resolve('shared'));
    child.register(Borrower.name, Borrower, Scope.Singleton);
    expect(child.resolve<Borrower>(Borrower.name).shared).toBe(shared);
    child.reset();
    child.reset();
    expect(shared.destroy).not.toHaveBeenCalled();
    expect(child.hasBinding('shared')).toBe(false);
    expect(parent.resolve('shared')).toBe(shared);
    parent.reset();
    expect(shared.destroy).toHaveBeenCalledTimes(1);
  });

  it('still disposes a locally owned alias exactly once', () => {
    const container = new Container();
    const instance = { dispose: jest.fn() };
    container.registerBorrowedInstance('borrowed', instance);
    container.registerInstance('owned', instance);
    container.reset();
    expect(instance.dispose).toHaveBeenCalledTimes(1);
  });
});
