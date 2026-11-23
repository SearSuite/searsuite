import { CellClipboardCodecRegistry, CellFormatTransferRegistry } from '../src';

it('keeps retained clipboard codecs from changing registered behavior', () => {
  const registry = new CellClipboardCodecRegistry();
  const codec = {
    cellType: 'custom',
    encode: () => 'original',
    decode: () => ({ type: 'custom', value: 'original' }),
    toPlainText: () => 'original',
  };
  const unregister = registry.register(codec);
  codec.cellType = 'changed';
  codec.encode = () => 'replacement';
  codec.toPlainText = () => 'replacement';

  const cell = { type: 'custom', value: 'value' };
  expect(registry.encode(cell)).toEqual({ type: 'custom', data: 'original' });
  expect(registry.toPlainText(cell)).toBe('original');
  expect(() => { (registry.get('custom') as { cellType: string }).cellType = 'changed'; }).toThrow();
  unregister();
  expect(registry.get('custom')).toBeUndefined();
});

it('keeps retained format codecs from changing registered behavior', () => {
  const registry = new CellFormatTransferRegistry();
  const codec = {
    cellType: 'custom',
    capture: () => ({ format: 'original' }),
    apply: (cell: { type: string; value: string }) => ({ ...cell, value: 'original' }),
  };
  const unregister = registry.register(codec);
  codec.cellType = 'changed';
  codec.capture = () => ({ format: 'replacement' });
  codec.apply = (cell) => ({ ...cell, value: 'replacement' });

  const cell = { type: 'custom', value: 'value' };
  expect(registry.capture(cell)).toEqual({ format: 'original' });
  expect(registry.apply(cell, {})).toEqual({ type: 'custom', value: 'original' });
  unregister();
  expect(registry.capture(cell)).toEqual({});
});
