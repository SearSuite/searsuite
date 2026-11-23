import { createFontDescriptor } from '../src';

describe('createFontDescriptor', () => {
  it('combines structured font size and family values at the render boundary', () => {
    expect(
      createFontDescriptor({
        fontSize: 12,
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }),
    ).toBe('12px Inter, ui-sans-serif, system-ui, sans-serif');
  });

  it('rejects invalid structured font values', () => {
    expect(() => createFontDescriptor({ fontSize: 0, fontFamily: 'Inter' })).toThrow('positive finite');
    expect(() => createFontDescriptor({ fontSize: 12, fontFamily: '   ' })).toThrow('non-empty');
  });
});
