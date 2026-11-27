import { Container, Scope, Injectable, Inject } from '../src';

let container: Container;

describe('Container remaining coverage', () => {
  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('registerTypes, dispose, destroy', () => {
    const mod = Symbol('mod');
    const types = { a: Symbol('a') };
    container.registerTypes(mod, types);
    expect(container.types.get(mod)).toBe(types);

    const resetSpy = jest.spyOn(container, 'reset');
    container.dispose();
    expect(resetSpy).toHaveBeenCalledTimes(1);

    container.destroy();
    expect(resetSpy).toHaveBeenCalledTimes(2);
  });

  test('getDependency circular and no binding', () => {
    @Injectable()
    class CircularB {
      constructor(@Inject('CircularA') public a: any, @Inject('NonExistent') public b: any) {}
    }

    @Injectable()
    class CircularA {
      constructor(@Inject('CircularB') public b: any) {}
    }

    container.register('CircularA', CircularA, Scope.Singleton);
    container.register('CircularB', CircularB, Scope.Singleton);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupCollapsed').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();

    container.getDependency();
    expect(logSpy).toHaveBeenCalled();
  });

  test('remaining branches: duplicate instance in reset, getDependencyGraphText circular, getDependency with instance', () => {
    const inst = { dispose: jest.fn() };
    container.registerInstance('dup1', inst);
    container.registerInstance('dup2', inst);

    const symA = Symbol('GraphA');
    container.addDependency(symA, symA);

    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupCollapsed').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();

    container.getDependencyGraphText();

    container.registerInstance('Inst1', {});
    container.getDependency();

    container.reset();
  });
});
