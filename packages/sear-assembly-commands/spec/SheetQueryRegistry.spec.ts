import { defineSheetQuery, defineSheetReaderQuery } from '../src/SheetQueryDefinition';
import { SheetQueryRegistry } from '../src/SheetQueryRegistry';

describe('SheetQueryRegistry result ownership', () => {
  it('detaches ordinary results from plugin-owned mutable state', () => {
    const registry = new SheetQueryRegistry();
    const state = { nested: { value: 1 } };
    const definition = defineSheetQuery<void, typeof state>('test.mutableResult');
    registry.register(definition, () => state);

    const result = registry.run(definition, undefined);
    result.nested.value = 9;

    expect(state.nested.value).toBe(1);
    expect(registry.run(definition, undefined).nested.value).toBe(1);
  });

  it('does not let a retained definition disable result detachment', () => {
    const registry = new SheetQueryRegistry();
    const state = { value: 1 };
    const definition: { id: string; resultMode?: 'reader'; __input?: void; __result?: typeof state } = {
      id: 'test.retainedDefinition',
    };
    registry.register(definition, () => state);
    definition.resultMode = 'reader';

    expect(registry.run(definition, undefined)).not.toBe(state);
  });

  it('preserves live reads while detaching method results and callback values', () => {
    const registry = new SheetQueryRegistry();
    const state = { nested: { value: 1 } };
    const reader = {
      get shape() { return [1, 1]; },
      getItem: () => state,
      forEach: (visit: (value: typeof state) => void) => visit(state),
    };
    const definition = defineSheetReaderQuery<void, typeof reader>('test.liveReader');
    registry.register(definition, () => reader);

    const result = registry.run(definition, undefined);
    result.getItem().nested.value = 9;
    result.forEach((value) => { value.nested.value = 8; });
    expect(state.nested.value).toBe(1);
    expect(result.getItem().nested.value).toBe(1);
    expect(registry.run(definition, undefined)).toBe(result);
    expect(result.shape).toEqual([1, 1]);
  });

  it('rejects callbacks returned as ordinary query data', () => {
    const registry = new SheetQueryRegistry();
    const definition = defineSheetQuery<void, () => void>('test.mutableCallback');
    registry.register(definition, () => () => void 0);

    expect(() => registry.run(definition, undefined)).toThrow('detached plain data');
  });
});
