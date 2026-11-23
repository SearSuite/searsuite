import 'reflect-metadata';
import { Container, Scope, Injectable } from '../src';

let container: Container;

@Injectable()
class Dummy {}

describe('Container extra coverage', () => {
  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('registerFactory default scope and resolve', () => {
    container.registerFactory('MyFactory', () => ({ value: 1 }));
    const val1 = container.resolve<any>('MyFactory');
    const val2 = container.resolve<any>('MyFactory');
    expect(val1).toBe(val2); // Singleton by default
  });

  test('registerFactory with prototype scope', () => {
    container.registerFactory('MyFactoryProto', () => ({ value: 1 }), Scope.Prototype);
    const val1 = container.resolve<any>('MyFactoryProto');
    const val2 = container.resolve<any>('MyFactoryProto');
    expect(val1).not.toBe(val2);
  });

  test('registerInstance and resolve', () => {
    const inst = { value: 2 };
    container.registerInstance('MyInst', inst);
    const resolved = container.resolve<any>('MyInst');
    expect(resolved).toBe(inst);
  });

  test('reset handles primitives and objects with dispose/destroy', () => {
    const disposeObj = { dispose: jest.fn() };
    const destroyObj = { destroy: jest.fn() };
    container.registerInstance('primitive', 123);
    container.registerInstance('nullObj', null);
    container.registerInstance('disposeObj', disposeObj);
    container.registerInstance('destroyObj', destroyObj);
    container.registerInstance('plainObj', {});

    container.reset();

    expect(disposeObj.dispose).toHaveBeenCalled();
    expect(destroyObj.destroy).toHaveBeenCalled();
  });

  test('getDependencyGraphText handles circular and normal dependencies', () => {
    const symA = Symbol('A');
    const symB = Symbol('B');
    container.addDependency(symA, symB);
    container.addDependency(symB, symA);
    const symC = Symbol('C');
    container.addDependency(symA, symC);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupCollapsed').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();

    container.getDependencyGraphText();
    expect(logSpy).toHaveBeenCalled();
  });

  test('getDependency handles various identifier types and circular deps', () => {
    @Injectable()
    class A {
      constructor() {}
    }
    Reflect.defineMetadata('design:paramtypes', ['B'], A);
    Reflect.defineMetadata('searsuite:inject', ['B'], A);

    @Injectable()
    class B {
      constructor() {}
    }
    Reflect.defineMetadata('design:paramtypes', ['A'], B);
    Reflect.defineMetadata('searsuite:inject', ['A'], B);

    container.register('A', A, Scope.Singleton);
    container.register('B', B, Scope.Singleton);

    function TestFn() {}
    container.register(TestFn as any, Dummy);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupCollapsed').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();

    container.getDependency();
    expect(logSpy).toHaveBeenCalled();
  });
});
