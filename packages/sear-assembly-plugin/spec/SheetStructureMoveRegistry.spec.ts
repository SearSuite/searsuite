import { PluginKey, SheetStructureMoveRegistry } from '../src';
import { createMoveRowOTOperation } from '@searsuite/sear-domain-ot';
import { SearError } from '@searsuite/sear-foundation-error';

describe('SheetStructureMoveRegistry', () => {
  const context = { target: new PluginKey('structure-test'), operations: [createMoveRowOTOperation([0], [1])] };
  it('validates before transformations and disposes registrations independently', () => {
    const registry = new SheetStructureMoveRegistry();
    const phases: string[] = [];
    const dispose = registry.register({
      id: 'test.transform',
      transformOperations: ({ operations }) => {
        phases.push('transform');
        return [...operations, createMoveRowOTOperation([1], [2])];
      },
    });
    registry.register({
      id: 'test.validate',
      validate: () => {
        phases.push('validate');
      },
    });
    expect(registry.plan(context)).toHaveLength(2);
    expect(phases).toEqual(['validate', 'transform']);
    expect(() => registry.register({ id: 'test.transform' })).toThrow(SearError);
    dispose();
    dispose();
    expect(registry.plan(context)).toEqual(context.operations);
    registry.destroy();
    expect(registry.plan(context)).toEqual(context.operations);
  });
  it('rejects before transforming and treats an empty move as a no-op', () => {
    const registry = new SheetStructureMoveRegistry();
    const transformOperations = jest.fn(({ operations }) => operations);
    registry.register({ id: 'test.transform', transformOperations });
    registry.register({
      id: 'test.reject',
      validate: () => {
        throw new SearError('locked');
      },
    });
    expect(registry.plan({ ...context, operations: [] })).toEqual([]);
    expect(() => registry.plan(context)).toThrow('locked');
    expect(transformOperations).not.toHaveBeenCalled();
  });
});
