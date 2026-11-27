import { SheetView } from '../../SheetViewContracts';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';

import { type Container } from '@searsuite/sear-foundation-di';

import { Platform } from '@searsuite/sear-foundation-platform';

import { CopyRangeCommand, CutRangeCommand, PasteRangeCommand, SheetClipboard, SheetPasteMode } from '@searsuite/sear-plugin-clipboard';

import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';

import { KeyboardRouter, TextInput } from '@searsuite/sear-render-input';

import { HandleDocumentInputCommand, IsCellEditingQuery, ReadSelectedCellEditTextQuery } from '@searsuite/sear-plugin-cell-editor';

import { TextInputKind } from '@searsuite/sear-domain-commands';

/** Routes sheet clipboard shortcuts through the typed command bus and host adapter. */
export function registerSheetClipboardViewBindings(container: Container): void {
  const keyboard = container.resolve<KeyboardRouter>(KeyboardRouter.symbol);
  const commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol);
  const clipboard = container.resolve<SheetClipboard>(SheetClipboard.symbol);
  const platform = container.resolve<Platform>(Platform.symbol);
  const queries = container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol);
  let active = true;
  const warn = (message: string, error: unknown): void => {
    if (active) platform.warn(message, error);
  };
  let pendingTextCut: Promise<void> | null = null;
  container.resolve<TextInput>(TextInput.symbol).subscribe({
    onPaste: (text) => {
      if (!active) return false;
      if (queries.has(IsCellEditingQuery) && queries.run(IsCellEditingQuery, void 0)) return false;
      try {
        const result = commands.run(PasteRangeCommand, { payload: { plainText: text } });
        commands.run(SelectRangeCommand, { anchor: [...result.range.start], focus: [...result.range.end] });
      } catch (error) {
        warn('Clipboard paste shortcut failed.', error);
      }
      return true;
    },
  });
  const stopKeyboard = keyboard.subscribe({
    onCopy: () => {
      if (!active) return;
      const selectedText = queries.has(ReadSelectedCellEditTextQuery)
        ? queries.run(ReadSelectedCellEditTextQuery, void 0)
        : null;
      if (selectedText !== null) {
        if (selectedText)
          void clipboard
            .write({ plainText: selectedText })
            .catch((error) => warn('Clipboard text copy shortcut failed.', error));
        return;
      }
      try {
        const result = commands.run(CopyRangeCommand, void 0);
        void clipboard.write(result.payload).catch((error) => warn('Clipboard copy write failed.', error));
      } catch (error) {
        warn('Clipboard copy shortcut failed.', error);
      }
    },
    onCut: () => {
      if (!active) return;
      const selectedText = queries.has(ReadSelectedCellEditTextQuery)
        ? queries.run(ReadSelectedCellEditTextQuery, void 0)
        : null;
      if (selectedText !== null) {
        if (!selectedText) return;
        pendingTextCut = clipboard
          .write({ plainText: selectedText })
          .then(() => {
            if (active && queries.run(ReadSelectedCellEditTextQuery, void 0) === selectedText) {
              commands.run(HandleDocumentInputCommand, { kind: 'delete' });
            }
          })
          .catch((error) => warn('Clipboard text cut shortcut failed.', error));
        return;
      }
      try {
        const result = commands.run(CutRangeCommand, void 0);
        void clipboard.write(result.payload).catch((error) => warn('Clipboard cut write failed.', error));
      } catch (error) {
        warn('Clipboard cut shortcut failed.', error);
      }
    },
    onPaste: async (valuesOnly) => {
      if (!active) return;
      try {
        if (pendingTextCut) {
          await pendingTextCut;
          pendingTextCut = null;
        }
        if (!active) return;
        const payload = await clipboard.read();
        if (!active) return;
        if (queries.has(IsCellEditingQuery) && queries.run(IsCellEditingQuery, void 0)) {
          if (payload?.plainText)
            commands.run(HandleDocumentInputCommand, {
              kind: TextInputKind.Text,
              text: payload.plainText,
            });
          return;
        }
        if (payload) {
          const result = commands.run(PasteRangeCommand, {
            payload,
            mode: valuesOnly ? SheetPasteMode.Values : SheetPasteMode.All,
          });
          await result.completion;
          if (!active || result.workbookMove) return;
          commands.run(SelectRangeCommand, {
            anchor: [result.range.start[0], result.range.start[1]],
            focus: [result.range.end[0], result.range.end[1]],
          });
        }
      } catch (error) {
        warn('Clipboard paste shortcut failed.', error);
      }
    },
  });
  container.resolve<ViewExtensionRegistry<SearCoreSheet, CellProperties>>(ViewExtensionRegistry.symbol).register(
    new SheetClipboardBindingsView(() => {
      active = false;
      stopKeyboard?.();
    }),
  );
}

/** Owns the clipboard shortcut subscriptions of one visual Sheet session. */
class SheetClipboardBindingsView extends SheetView {
  readonly #dispose: () => void;
  constructor(dispose: () => void) {
    super(new PluginKey('SheetClipboardBindingsView'));
    this.#dispose = dispose;
  }
  public destroyView(): void {
    this.assertRuntimeWriteAllowed();
    this.#dispose();
  }
}
