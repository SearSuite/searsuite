import 'reflect-metadata';
import { Container, Scope, Injectable, Inject, Singleton } from '../src';

let container: Container;

@Injectable()
class LazyService {
  getValue() {
    return 'Lazy Value';
  }
}

@Injectable()
class TestServiceA {
  constructor(@Inject('TestServiceB') private getServiceB: () => TestServiceB) {}

  doSomething() {
    return 'A' + this.getServiceB().doSomethingElse();
  }
}

@Injectable()
class TestServiceB {
  constructor(@Inject('TestServiceA') private getServiceA: () => TestServiceA) {}

  doSomethingElse() {
    return 'B';
  }
}

@Injectable()
class NoDependencyService {
  doWork() {
    return 'Work done';
  }
}

@Injectable()
class DependentService {
  constructor(@Inject('NoDependencyService') private noDepService: NoDependencyService) {}

  perform() {
    return this.noDepService.doWork();
  }
}

// Test class without @Injectable marker
class NotInjectableService {
  doWork() {
    return 'Not Injectable Work done';
  }
}

// Class using @Singleton decorator
@Singleton()
class SingletonService {
  getInstanceValue() {
    return 'Singleton Instance';
  }
}

describe('Container', () => {
  beforeEach(() => {
    container = new Container();
    container.register('TestServiceA', TestServiceA, Scope.Singleton);
    container.register('TestServiceB', TestServiceB, Scope.Singleton);
    container.register('NoDependencyService', NoDependencyService, Scope.Prototype);
    container.register('DependentService', DependentService, Scope.Prototype);
    container.register('LazyService', LazyService, Scope.Singleton);
  });

  test('should detect circular dependencies', () => {
    expect(() => {
      container.resolve<TestServiceA>('TestServiceA');
    }).toThrow(/Circular dependency detected/);
  });

  test('should resolve a service with no dependencies', () => {
    const service = container.resolve<NoDependencyService>('NoDependencyService');
    expect(service.doWork()).toBe('Work done');
  });

  test('should resolve a service with dependencies', () => {
    const service = container.resolve<DependentService>('DependentService');
    expect(service.perform()).toBe('Work done');
  });

  test('should throw error if no binding found', () => {
    expect(() => {
      container.resolve('NonExistentService');
    }).toThrow(/No binding found for identifier/);
  });

  test('should handle singleton scope correctly', () => {
    const instance1 = container.resolve<NoDependencyService>('NoDependencyService');
    const instance2 = container.resolve<NoDependencyService>('NoDependencyService');
    expect(instance1).not.toBe(instance2);

    container.register('NoDependencyService', NoDependencyService, Scope.Singleton);
    const singleton1 = container.resolve<NoDependencyService>('NoDependencyService');
    const singleton2 = container.resolve<NoDependencyService>('NoDependencyService');
    expect(singleton1).toBe(singleton2);
  });

  test('should throw error if class is not injectable', () => {
    expect(() => {
      container.register('NotInjectableService', NotInjectableService);
    }).toThrow(/Class NotInjectableService is not injectable/);
  });

  test('should create singleton instance if it does not exist', () => {
    // Register the SingletonService with the container
    container.register('SingletonService', SingletonService, Scope.Singleton);

    // Ensure that the singleton does not exist before the first resolution
    expect(container.hasSingleton('SingletonService')).toBe(false);

    // Resolve the service, which should create the singleton instance
    const singleton1 = container.resolve<SingletonService>('SingletonService');

    // Verify that the singleton instance now exists
    expect(container.hasSingleton('SingletonService')).toBe(true);
    expect(singleton1.getInstanceValue()).toBe('Singleton Instance');
  });

  test('should register and resolve singleton service using @Singleton decorator', () => {
    // Ensure that the class is registered with the correct scope
    container.register('SingletonServiceWithDecorator', SingletonService, Scope.Singleton);

    const singleton1 = container.resolve<SingletonService>('SingletonServiceWithDecorator');
    const singleton2 = container.resolve<SingletonService>('SingletonServiceWithDecorator');

    // Check that both instances are the same
    expect(singleton1).toBe(singleton2);
    expect(singleton1.getInstanceValue()).toBe('Singleton Instance');
  });

  test('should create a lazy resolver for a service', () => {
    // Use createLazy to get a lazy resolver function
    const lazyResolver = container.createLazy<LazyService>('LazyService');

    // Verify that lazyResolver is a function
    expect(typeof lazyResolver).toBe('function');

    // Call the lazy resolver to get the instance
    const serviceInstance = lazyResolver();

    // Verify that the instance is of the correct type and has the expected behavior
    expect(serviceInstance).toBeInstanceOf(LazyService);
    expect(serviceInstance.getValue()).toBe('Lazy Value');
  });
});
