import { SheetCellInputValidationRegistry } from '../src';

describe('SheetCellInputValidationRegistry command boundary', () => {
  it('checks clear protection only for validators that opt in', () => {
    const registry = new SheetCellInputValidationRegistry();
    registry.register('ordinary-rule', () => ({ valid: false, reject: true, message: 'ordinary rejection' }));
    const disposeProtection = registry.register('protected-cell', (row, column) =>
      row === 1 && column === 2
        ? { valid: false, reject: true, message: 'protected result' }
        : { valid: true, reject: false }, { protectClear: true });
    expect(registry.validateClear(1, 2)).toMatchObject({ reject: true, message: 'protected result' });
    expect(registry.validateClear(1, 3).reject).toBe(false);
    disposeProtection();
    expect(registry.validateClear(1, 2).reject).toBe(false);
  });

  it('enforces cell text limits at the 32767-character and 253-line-break boundaries', () => {
    const registry = new SheetCellInputValidationRegistry();
    expect(registry.validate(0, 0, 'X' + 'A'.repeat(32766)).reject).toBe(false);
    expect(registry.validate(0, 0, 'X' + 'A'.repeat(32767))).toMatchObject({
      reject: true, message: 'A cell can contain at most 32767 characters.',
    });
    expect(registry.validate(0, 0, Array(254).fill('x').join('\n')).reject).toBe(false);
    expect(registry.validate(0, 0, Array(255).fill('x').join('\n'))).toMatchObject({
      reject: true, message: 'A cell can contain at most 253 line breaks.',
    });
  });

  it('rejects direct runtime registration and dispatches disposal through the owner', () => {
    const registry = new SheetCellInputValidationRegistry();
    const validator = () => ({ valid: false, reject: true });
    const disposeInitial = registry.register('initial', validator);
    let executing = false;
    const dispatched: number[] = [];
    const teardownToken = {};
    registry.enforceCommandBoundary(() => executing, (id) => dispatched.push(id), teardownToken);

    expect(() => registry.register('outside', validator)).toThrow('editor.commands.run');
    expect(registry.validate(0, 0, 'x').reject).toBe(true);
    executing = true;
    const disposeRuntime = registry.register('runtime', validator);
    executing = false;
    disposeRuntime();
    expect(dispatched).toHaveLength(1);
    expect(registry.validate(0, 0, 'x').reject).toBe(true);
    executing = true;
    registry.unregister(dispatched[0]!);
    executing = false;
    disposeInitial();
    expect(dispatched).toHaveLength(2);
    executing = true;
    registry.unregister(dispatched[1]!);
    executing = false;
    expect(registry.validate(0, 0, 'x').valid).toBe(true);
    expect(() => registry.beginTeardown({})).toThrow('editor owner');
    registry.beginTeardown(teardownToken);
    expect(() => registry.register('late', validator)).toThrow('being destroyed');
  });
});
