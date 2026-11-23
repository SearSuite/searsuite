import { type FormulaLanguageService } from '@searsuite/sear-domain-formula-engine';
import { FormulaTextServiceRegistry } from '../src';

describe('FormulaTextServiceRegistry', () => {
  it('supports order-independent service disposal and forwards cache invalidation', () => {
    const registry = new FormulaTextServiceRegistry();
    let firstListener: (() => void) | undefined;
    const first: FormulaLanguageService = {
      detectLanguage: () => ({ status: 'ready', value: 'en' }),
      translate: () => ({ status: 'unavailable' }),
      subscribeInvalidation: (listener) => ((firstListener = listener), () => { firstListener = undefined; }),
    };
    const second: FormulaLanguageService = {
      detectLanguage: () => ({ status: 'ready', value: 'zh' }),
      translate: () => ({ status: 'unavailable' }),
    };
    const invalidated = jest.fn();
    registry.subscribeInvalidation(invalidated);
    const disposeFirst = registry.registerLanguageService(first);
    const disposeSecond = registry.registerLanguageService(second);
    disposeFirst();
    expect(registry.getLanguageService()).toBe(second);
    disposeSecond();
    expect(registry.getLanguageService()).toBeUndefined();
    firstListener?.();
    expect(invalidated).toHaveBeenCalledTimes(4);
  });

  it('requires command execution for registration and dispatches token disposal', () => {
    const registry = new FormulaTextServiceRegistry();
    const service: FormulaLanguageService = {
      detectLanguage: () => ({ status: 'ready', value: 'en' }),
      translate: () => ({ status: 'unavailable' }),
    };
    let executing = false;
    const dispatched: number[] = [];
    registry.enforceCommandBoundary(() => executing, (id) => dispatched.push(id));
    expect(() => registry.registerLanguageService(service)).toThrow('commands.run');
    expect(() => registry.registerPhoneticReader({ getCellPhonetic: () => '' })).toThrow('commands.run');

    executing = true;
    const dispose = registry.registerLanguageService(service);
    executing = false;
    dispose();
    expect(dispatched).toHaveLength(1);
    expect(registry.getLanguageService()).toBe(service);

    executing = true;
    registry.unregisterRegistration(dispatched[0]);
    executing = false;
    expect(registry.getLanguageService()).toBeUndefined();
  });
});
