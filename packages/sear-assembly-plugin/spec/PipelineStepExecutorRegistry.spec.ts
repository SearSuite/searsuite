import { PipelineStepExecutorRegistry } from '@searsuite/sear-assembly-plugin';

describe('PipelineStepExecutorRegistry', () => {
  it('registers and unregisters executors', () => {
    const registry = new PipelineStepExecutorRegistry();
    const executor = { kind: 'my-kind', execute: () => {} };

    const unregister = registry.register(executor);
    expect(registry.get('my-kind')).toMatchObject({ kind: 'my-kind', execute: expect.any(Function) });
    expect(registry.get('my-kind')).not.toBe(executor);

    // unregister
    unregister();
    expect(registry.get('my-kind')).toBeUndefined();

    // calling unregister again should do nothing safely
    unregister();
    expect(registry.get('my-kind')).toBeUndefined();
  });

  it('throws on duplicate kind', () => {
    const registry = new PipelineStepExecutorRegistry();
    const executor = { kind: 'dup', execute: () => {} };
    registry.register(executor);

    const executor2 = { kind: 'dup', execute: () => {} };
    expect(() => registry.register(executor2)).toThrow();
  });

  it('does not let a retained executor object change registered behavior', () => {
    const registry = new PipelineStepExecutorRegistry();
    const calls: string[] = [];
    const executor = {
      kind: 'custom',
      execute() {
        calls.push('original');
      },
    };
    const unregister = registry.register(executor);
    executor.kind = 'changed';
    executor.execute = () => calls.push('replacement');

    registry.get('custom')!.execute({} as never, {} as never);
    expect(calls).toEqual(['original']);
    expect(() => {
      (registry.get('custom') as { kind: string }).kind = 'changed';
    }).toThrow();
    unregister();
    expect(registry.get('custom')).toBeUndefined();
  });
});
