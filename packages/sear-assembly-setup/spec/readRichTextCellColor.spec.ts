import { readRichTextCellColor } from '@searsuite/sear-assembly-sheet-kernel';

describe('readRichTextCellColor', () => {
  it('BUG-078 reads the uniform color of copied rich text', () => {
    const red = {
      type: 'richtext',
      value: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'col', attrs: { textStyle: { color: '#FE0300' } } },
            { type: 'text', text: 'ored', attrs: { textStyle: { color: '#fe0300' } } },
          ],
        },
      ],
    };
    expect(readRichTextCellColor(red)).toBe('#FE0300');
    expect(
      readRichTextCellColor({
        type: 'richtext',
        value: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'red', attrs: { textStyle: { color: '#fe0300' } } },
              { type: 'text', text: 'plain' },
            ],
          },
        ],
      }),
    ).toBeNull();
  });
});
