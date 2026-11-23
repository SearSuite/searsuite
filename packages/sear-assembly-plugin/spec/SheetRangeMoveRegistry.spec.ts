import { PluginKey, SheetRangeMoveRegistry, SheetRangeMoveStatus } from '../src';
import { SearError } from '@searsuite/sear-foundation-error';

describe('SheetRangeMoveRegistry', () => {
  const context = { source: { start: [0, 0], end: [0, 0] }, destination: { start: [1, 1], end: [1, 1] } } as const;
  it('validates before planning and transforms only after all owners have planned', () => {
    const registry = new SheetRangeMoveRegistry();
    const phases: string[] = [];
    const target = new PluginKey('test-move');
    registry.register({
      id: 'test.derived.rangeMove',
      plan: () => {
        phases.push('derived');
        return [];
      },
      transformPlans: (_context, plans) => {
        phases.push('transform');
        expect(plans).toHaveLength(1);
        return plans;
      },
    });
    const dispose = registry.register({
      id: 'test.data.rangeMove',
      validate: () => {
        phases.push('validate');
      },
      hasConflict: () => true,
      plan: () => {
        phases.push('data');
        return [{ target, operations: [] }];
      },
    });
    expect(registry.hasConflict(context)).toBe(true);
    expect(registry.plan(context)).toEqual([{ target, operations: [] }]);
    expect(phases).toEqual(['validate', 'validate', 'derived', 'data', 'transform']);
    expect(() => registry.register({ id: 'test.data.rangeMove', plan: () => [] })).toThrow(SearError);
    dispose();
    dispose();
    expect(registry.hasConflict(context)).toBe(false);
    registry.destroy();
    expect(registry.plan(context)).toEqual([]);
  });
  it('rejects the whole move when any contributor fails validation', () => {
    const registry = new SheetRangeMoveRegistry();
    const plan = jest.fn(() => []);
    registry.register({ id: 'test.data.rangeMove', plan });
    registry.register({
      id: 'test.locks.rangeMove',
      validate: () => {
        throw new SearError('locked');
      },
      plan,
    });
    expect(() => registry.plan(context)).toThrow('locked');
    expect(plan).not.toHaveBeenCalled();
  });
  it('assesses current owner constraints without planning or mutating state', () => {
    const registry = new SheetRangeMoveRegistry();
    const plan = jest.fn(() => []);
    let locked = false;
    let occupied = false;
    const issue = new SearError('locked', { cell: [1, 1] });
    registry.register({
      id: 'test.locks.rangeMove',
      validate: () => {
        if (locked) throw issue;
      },
      hasConflict: () => occupied,
      plan,
    });
    expect(registry.analyze(context)).toEqual({ context, status: SheetRangeMoveStatus.Allowed });
    occupied = true;
    expect(registry.analyze(context)).toEqual({ context, status: SheetRangeMoveStatus.RequiresConfirmation });
    locked = true;
    expect(registry.analyze(context)).toEqual({
      context,
      status: SheetRangeMoveStatus.Blocked,
      issue: { ownerId: 'test.locks.rangeMove', code: issue.code, message: issue.message, details: issue.details },
    });
    expect(() => registry.hasConflict(context)).toThrow('locked');
    expect(() => registry.plan(context)).toThrow('locked');
    expect(plan).not.toHaveBeenCalled();
    locked = false;
    occupied = false;
    expect(registry.analyze(context).status).toBe(SheetRangeMoveStatus.Allowed);
  });
  it('does not disguise unexpected contributor failures as movement constraints', () => {
    const registry = new SheetRangeMoveRegistry();
    const failure = new Error('unexpected');
    registry.register({
      id: 'test.broken.rangeMove',
      validate: () => {
        throw failure;
      },
      plan: () => [],
    });
    expect(() => registry.analyze(context)).toThrow(failure);
  });
});
