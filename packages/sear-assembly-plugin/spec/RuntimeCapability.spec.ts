import {
  RuntimeCapabilityError,
  RuntimeCapabilityErrorCode,
  RuntimeCapabilityRegistry,
  defineRuntimeCapability,
} from '../src';

describe('RuntimeCapabilityRegistry', () => {
  it('publishes typed values, rejects conflicts, and disposes registrations idempotently', () => {
    const value = defineRuntimeCapability<{ id: number }>('test.runtime.value');
    const registry = new RuntimeCapabilityRegistry('test editor');
    const dispose = registry.register(value, { id: 1 });

    expect(registry.require(value)).toEqual({ id: 1 });
    expect(registry.has(value)).toBe(true);
    expect(registry.getRegisteredCapabilityIds()).toEqual(['test.runtime.value']);
    expect(() => registry.register(value, { id: 2 })).toThrow(RuntimeCapabilityError);

    dispose();
    dispose();
    expect(registry.get(value)).toBeUndefined();
  });

  it('reports invalid, missing, and destroyed access with stable errors', () => {
    expect(() => defineRuntimeCapability('  ')).toThrow(RuntimeCapabilityError);
    try {
      defineRuntimeCapability('');
    } catch (error) {
      expect(error).toMatchObject({ code: RuntimeCapabilityErrorCode.InvalidDefinition });
    }
    const missing = defineRuntimeCapability<string>('test.runtime.missing');
    const registry = new RuntimeCapabilityRegistry('test editor');

    expect(() => registry.require(missing)).toThrow(RuntimeCapabilityError);
    try {
      registry.require(missing);
    } catch (error) {
      expect(error).toMatchObject({
        code: RuntimeCapabilityErrorCode.NotRegistered,
        details: { owner: 'test editor', capabilityId: 'test.runtime.missing' },
      });
    }

    registry.destroy();
    registry.destroy();
    expect(() => registry.get(missing)).toThrow(
      expect.objectContaining({ code: RuntimeCapabilityErrorCode.RegistryDestroyed }),
    );
  });
});
