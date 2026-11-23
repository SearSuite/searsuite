import { SheetLifecycleCoordinator, type SheetLifecycleContext, type SheetLifecycleController } from '../src';

describe('SheetLifecycleCoordinator', () => {
  const context = {} as SheetLifecycleContext;

  it('starts registered controllers and disposes them in reverse order', () => {
    const calls: string[] = [];
    const first = createController('first', calls);
    const second = createController('second', calls);
    const coordinator = new SheetLifecycleCoordinator();
    coordinator.register(first);
    coordinator.register(second);

    coordinator.start(context);
    coordinator.destroy();
    coordinator.destroy();

    expect(calls).toEqual(['start:first', 'start:second', 'destroy:second', 'destroy:first']);
  });

  it('starts controllers registered after the sheet has started', () => {
    const calls: string[] = [];
    const coordinator = new SheetLifecycleCoordinator();
    coordinator.start(context);

    const unregister = coordinator.register(createController('external', calls));
    unregister();
    unregister();

    expect(calls).toEqual(['start:external', 'destroy:external']);
  });

  it('requires commands for runtime changes and the owner token for teardown', () => {
    const calls: string[] = [];
    const coordinator = new SheetLifecycleCoordinator();
    const unregisterInitial = coordinator.register(createController('initial', calls));
    coordinator.start(context);
    let executing = false;
    const teardownToken = {};
    coordinator.enforceCommandBoundary(() => {
      if (!executing) throw new Error('editor.commands.run required');
    }, teardownToken);

    expect(() => coordinator.register(createController('direct', calls))).toThrow('editor.commands.run');
    expect(() => unregisterInitial()).toThrow('editor.commands.run');
    expect(() => coordinator.destroy()).toThrow('editor owner');
    expect(() => coordinator.beginTeardown({})).toThrow('editor owner');

    executing = true;
    const unregisterRuntime = coordinator.register(createController('runtime', calls));
    unregisterRuntime();
    executing = false;
    coordinator.beginTeardown(teardownToken);
    Object.assign(coordinator, { destroyed: true, controllers: new Set(), context: undefined });
    coordinator.destroy();
    expect(calls).toEqual(['start:initial', 'start:runtime', 'destroy:runtime', 'destroy:initial']);
  });

  it('rejects duplicate registration and every lifecycle action after destruction', () => {
    const coordinator = new SheetLifecycleCoordinator();
    const controller: SheetLifecycleController = { start: jest.fn(), destroy: jest.fn() };

    coordinator.register(controller);
    expect(() => coordinator.register(controller)).toThrow();

    coordinator.start({} as any);
    // call start again to cover "if (this.context) return;"
    coordinator.start({} as any);

    coordinator.destroy();
    expect(() => coordinator.register({ start: jest.fn(), destroy: jest.fn() })).toThrow();
    expect(() => coordinator.start({} as any)).toThrow();
  });
});

function createController(name: string, calls: string[]): SheetLifecycleController {
  return {
    start(): void {
      calls.push(`start:${name}`);
    },
    destroy(): void {
      calls.push(`destroy:${name}`);
    },
  };
}
