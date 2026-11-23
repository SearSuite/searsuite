import { RichTextRunRenderRegistry } from '../src';

describe('RichTextRunRenderRegistry', () => {
  it('rejects duplicate keys and unregisters contributions', () => {
    const registry = new RichTextRunRenderRegistry();
    const contribution = { key: 'test.render', resolveFont: ({ font }: { font: string }) => `bold ${font}` };
    const dispose = registry.register(contribution);

    expect(() => registry.register(contribution)).toThrow('already exists');
    expect(registry.resolveFont('16px sans-serif', void 0)).toBe('bold 16px sans-serif');
    dispose();
    expect(registry.resolveFont('16px sans-serif', void 0)).toBe('16px sans-serif');
  });

  it('passes the render context to plugin-owned path drawing', () => {
    const registry = new RichTextRunRenderRegistry();
    const calls: string[] = [];
    registry.register({
      key: 'test.path',
      paintRun: ({ context, x, baselineY, width }) => {
        calls.push('paint');
        context.beginPath();
        context.moveTo(x, baselineY);
        context.lineTo(x + width, baselineY);
        context.stroke();
      },
    });
    const context = {
      beginPath: () => calls.push('beginPath'),
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
      stroke: () => calls.push('stroke'),
    };

    registry.paintRun({
      context: context as never,
      text: 'abc',
      style: void 0,
      x: 2,
      baselineY: 10,
      width: 30,
      height: 12,
      fontAscent: 9,
      fontDescent: 3,
    });
    expect(calls).toEqual(['paint', 'beginPath', 'moveTo', 'lineTo', 'stroke']);
  });

  it('keeps retained callbacks stable and requires command scope to unregister', () => {
    const registry = new RichTextRunRenderRegistry();
    const contribution = { key: 'test.stable', resolveFont: ({ font }: { font: string }) => `bold ${font}` };
    const dispose = registry.register(contribution);
    contribution.key = 'test.changed';
    contribution.resolveFont = () => 'changed';
    expect(registry.resolveFont('16px sans-serif', void 0)).toBe('bold 16px sans-serif');
    registry.enforceWriteBoundary(() => { throw new Error('command required'); });
    expect(() => dispose()).toThrow('command required');
  });
});
