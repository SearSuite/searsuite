import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { DataViewFieldDuplicateError, SheetDataEngine } from '../src';

describe('SheetDataEngine', () => {
  it('keeps the committed registry private and requires its owner token for writes', () => {
    const engine = new SheetDataEngine();
    const key = new PluginKey('owner');
    const token = {};
    engine.registerDataType(key, { value: 'before' });
    engine.enforceWriteBoundary(token);

    expect((engine as unknown as { dataTypeRegistry?: unknown }).dataTypeRegistry).toBeUndefined();
    expect(() => engine.replaceDataType(key, { value: 'bypass' })).toThrow();
    expect(() => engine.registerDataType(key, { value: 'bypass' })).toThrow();
    expect(() => engine.registerDataViewField(key, {
      viewKey: 'sheet', fieldKey: 'value', select: (state: { value: string }) => state.value,
    })).toThrow();
    expect(engine.getDataType(key)).toEqual({ value: 'before' });
    engine.replaceDataType(key, { value: 'after' }, token);
    expect(engine.getDataType(key)).toEqual({ value: 'after' });
  });

  it('supports inherited named data registration', () => {
    const engine = new SheetDataEngine();
    const key = new PluginKey('data');

    engine.initialize();
    engine.registerDataType(key, { value: 1 });

    expect(engine.getDataType(key)).toEqual({ value: 1 });
    engine.replaceDataType(key, { value: 2 });
    expect(engine.getDataType(key)).toEqual({ value: 2 });
    expect(engine.getDataType(new PluginKey('missing'))).toBeUndefined();
  });

  it('reads registered plugin-owned data view fields independently', () => {
    const engine = new SheetDataEngine();
    const key = new PluginKey('custom');

    engine.registerDataType(
      key,
      { visible: 1, optional: void 0 },
      {
        dataView: [
          { viewKey: 'customView', fieldKey: 'visible', select: (state) => state.visible },
          { viewKey: 'customView', fieldKey: 'optional', select: (state) => state.optional, required: false },
        ],
      },
    );

    expect(engine.readDataViewField('customView', 'visible')).toBe(1);
    expect(engine.readDataViewField('customView', 'optional')).toBeUndefined();
    expect(engine.readDataViewField('customView', 'missing')).toBeUndefined();
    expect(engine.readDataViewField('missingView', 'visible')).toBeUndefined();
    expect(engine.getDataViewFieldKeys('customView')).toEqual(['visible', 'optional']);
    expect(engine.getDataViewFieldKeys('missingView')).toEqual([]);

    engine.replaceDataType(key, { visible: 2, optional: 'ready' });
    expect(engine.readDataViewField('customView', 'visible')).toBe(2);
    expect(engine.readDataViewField('customView', 'optional')).toBe('ready');
  });

  it('keeps registered data view metadata independent of retained option handles', () => {
    const engine = new SheetDataEngine();
    const key = new PluginKey('metadata');
    const field = { viewKey: 'customView', fieldKey: 'value', select: (state: { value: number }) => state.value };
    const options = { dataView: [field] };
    engine.registerDataType(key, { value: 3 }, options);
    const retained = engine.getDataTypeOptions(key)!;

    field.fieldKey = 'forged';
    options.dataView.push({ ...field });
    expect(() => (retained.dataView as unknown as unknown[]).push({ ...field })).toThrow();
    expect(() => { (retained.dataView![0] as { fieldKey: string }).fieldKey = 'forged'; }).toThrow();
    expect(engine.getDataTypeOptions(key)).toBe(retained);
    expect(engine.getDataViewFieldKeys('customView')).toEqual(['value']);
    expect(engine.readDataViewField('customView', 'value')).toBe(3);
  });

  it('allows the same owner to update a data view field registration before state exists', () => {
    const engine = new SheetDataEngine();
    const key = new PluginKey('custom');

    engine.registerDataViewField(key, { viewKey: 'customView', fieldKey: 'value', select: () => 'first' });
    expect(engine.readDataViewField('customView', 'value')).toBeUndefined();

    engine.registerDataViewField(key, { viewKey: 'customView', fieldKey: 'value', select: () => 'second' });
    engine.registerDataType(key, { value: 1 });

    expect(engine.readDataViewField('customView', 'value')).toBe('second');
  });

  it('rejects duplicate named data view fields from different owners', () => {
    const engine = new SheetDataEngine();
    const firstKey = new PluginKey('first');
    const secondKey = new PluginKey('second');

    engine.registerDataType(
      firstKey,
      { value: 1 },
      {
        dataView: [{ viewKey: 'customView', fieldKey: 'value', select: (state) => state.value }],
      },
    );

    expect(() => {
      engine.registerDataType(
        secondKey,
        { value: 2 },
        {
          dataView: [{ viewKey: 'customView', fieldKey: 'value', select: (state) => state.value }],
        },
      );
    }).toThrow(DataViewFieldDuplicateError);
  });
});
