import { RichTextInlineStyleRegistry } from '@searsuite/sear-domain-doc';
import { RichTextRunRenderRegistry } from '@searsuite/sear-render-node';
import {
  createBoldContribution,
  createFontFamilyContribution,
  createFontSizeContribution,
  createTextColorContribution,
  createItalicContribution,
  createUnderlineContribution,
  createStrikethroughContribution,
} from '@searsuite/sear-assembly-doc';
import {
  createBoldRenderContribution,
  createFontFamilyRenderContribution,
  createFontSizeRenderContribution,
  createTextColorRenderContribution,
  createItalicRenderContribution,
  createUnderlineRenderContribution,
  createStrikethroughRenderContribution,
} from '@searsuite/sear-render-node';

describe('inline text style contributions', () => {
  it('registers built-in inline style contribution factories from their feature folders', () => {
    const registry = new RichTextInlineStyleRegistry();
    registry.register(createFontFamilyContribution());
    registry.register(createFontSizeContribution());
    registry.register(createBoldContribution());
    registry.register(createItalicContribution());
    registry.register(createUnderlineContribution());
    registry.register(createStrikethroughContribution());
    registry.register(createTextColorContribution());

    const renderRegistry = new RichTextRunRenderRegistry();
    renderRegistry.register(createFontFamilyRenderContribution());
    renderRegistry.register(createFontSizeRenderContribution());
    renderRegistry.register(createBoldRenderContribution());
    renderRegistry.register(createItalicRenderContribution());
    renderRegistry.register(createUnderlineRenderContribution());
    renderRegistry.register(createStrikethroughRenderContribution());
    renderRegistry.register(createTextColorRenderContribution());

    expect(
      registry.readTextNodeStyle({
        attrs: {
          textStyle: {
            fontFamily: 'Inter',
            fontSize: 18,
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            color: '#f00',
          },
        },
      } as never),
    ).toEqual({
      fontFamily: 'Inter',
      fontSize: 18,
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      color: '#f00',
    });
    expect(
      renderRegistry.resolveFont('16px sans-serif', {
        fontFamily: 'Inter',
        fontSize: 18,
        bold: true,
        italic: true,
      }),
    ).toBe('italic bold 18px Inter');
    const lines: Array<[number, number, number, number]> = [];
    const context = {
      setLineWidth: jest.fn(),
      beginPath: () => lines.push([0, 0, 0, 0]),
      moveTo: (x: number, y: number) => {
        const last = lines[lines.length - 1];
        if (last) {
          last[0] = x;
          last[1] = y;
        }
      },
      lineTo: (x: number, y: number) => {
        const last = lines[lines.length - 1];
        if (last) {
          last[2] = x;
          last[3] = y;
        }
      },
      stroke: jest.fn(),
    };
    renderRegistry.paintRun({
      context: context as never,
      text: 'text',
      style: { underline: true, strikethrough: true },
      x: 10,
      baselineY: 20,
      width: 40,
      height: 16,
      fontAscent: 12,
      fontDescent: 4,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]?.[0]).toBe(10);
    expect(lines[0]?.[2]).toBe(50);
    expect(lines[1]?.[0]).toBe(10);
    expect(lines[1]?.[2]).toBe(50);
    expect(registry.requireMutation('italic').apply({ attrs: {}, value: true })).toEqual({
      textStyle: { italic: true },
    });
    expect(registry.requireMutation('underline').apply({ attrs: {}, value: true })).toEqual({
      textStyle: { underline: true },
    });
    expect(registry.requireMutation('strikethrough').apply({ attrs: {}, value: true })).toEqual({
      textStyle: { strikethrough: true },
    });
    expect(registry.requireMutation('fontFamily').apply({ attrs: {}, value: 'Serif' })).toEqual({
      textStyle: { fontFamily: 'Serif' },
    });
    expect(registry.requireMutation('color').apply({ attrs: {}, value: '#0f0' })).toEqual({
      textStyle: { color: '#0f0' },
    });
    expect(registry.requireMutation('bold').apply({ attrs: {}, value: true })).toEqual({
      textStyle: { bold: true },
    });
    expect(registry.requireMutation('bold').apply({ attrs: { textStyle: { bold: true } }, value: false })).toEqual({});
    expect(() => registry.requireMutation('fontSize').apply({ attrs: {}, value: 0 })).toThrow(
      'SetDocFontSizeCommand.fontSize must be a positive finite number or null.',
    );
  });
});
