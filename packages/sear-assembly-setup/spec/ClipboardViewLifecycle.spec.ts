import { SheetClipboard } from '@searsuite/sear-plugin-clipboard';
import { Platform } from '@searsuite/sear-foundation-platform';
import { createSheetEditorHarness } from './support/SheetEditorHarness';

it('ignores clipboard read completion after its visual session has been destroyed', async () => {
  const { editor, container, keyboard } = createSheetEditorHarness();
  let complete!: (payload: { plainText: string }) => void;
  const pending = new Promise<{ plainText: string }>((resolve) => {
    complete = resolve;
  });
  jest.spyOn(container.resolve<SheetClipboard>(SheetClipboard.symbol), 'read').mockReturnValue(pending);
  const warn = jest.spyOn(container.resolve<Platform>(Platform.symbol), 'warn').mockImplementation(() => {});
  keyboard.handlers.onPaste?.(false);
  editor.destroy();
  complete({ plainText: 'late' });
  await pending;
  await Promise.resolve();
  expect(warn).not.toHaveBeenCalled();
});
