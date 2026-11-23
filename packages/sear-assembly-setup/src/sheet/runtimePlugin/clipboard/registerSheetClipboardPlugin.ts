import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import {
  CopyRangeCommand,
  CutRangeCommand,
  DefaultSheetClipboardCodec,
  PasteRangeCommand,
  SheetClipboard,
  SheetClipboardCodecSymbol,
  SheetClipboardDataSourceSymbol,
  SheetClipboardPlugin,
  SheetPasteMode,
} from '@searsuite/sear-plugin-clipboard';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { KeyboardRouter, TextInput } from '@searsuite/sear-render-input';
import { HandleDocumentInputCommand, IsCellEditingQuery, ReadSelectedCellEditTextQuery } from '@searsuite/sear-plugin-cell-editor';
import { TextInputKind } from '@searsuite/sear-render-input';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { DefaultSheetClipboardDataSource } from '../../DefaultSheetClipboardDataSource';

/** Registers clipboard services, plugin, and keyboard shortcuts. */
export function registerSheetClipboardPlugin(
  container: Container,
  manager: PluginManager<SearCoreSheet, CellProperties>,
): void {
  container.register(SheetClipboardDataSourceSymbol, DefaultSheetClipboardDataSource, Scope.Singleton);
  container.register(SheetClipboardCodecSymbol, DefaultSheetClipboardCodec, Scope.Singleton);
  container.register(SheetClipboardPlugin.symbol, SheetClipboardPlugin, Scope.Singleton);
  manager.registerPlugin(container.resolve<SheetClipboardPlugin>(SheetClipboardPlugin.symbol));
  registerClipboardKeyboardShortcuts(container);
}

/** Routes sheet clipboard shortcuts through the typed command bus and host adapter. */
function registerClipboardKeyboardShortcuts(container: Container): void {
  const keyboard = container.resolve<KeyboardRouter>(KeyboardRouter.symbol);
  const commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol);
  const clipboard = container.resolve<SheetClipboard>(SheetClipboard.symbol);
  const platform = container.resolve<Platform>(Platform.symbol);
  const queries = container.resolve<SheetQueryRegistry>(SheetQueryRegistry.symbol);
  let pendingTextCut: Promise<void> | null = null;
  container.resolve<TextInput>(TextInput.symbol).subscribe({
    onPaste: (text) => {
      if (queries.has(IsCellEditingQuery) && queries.run(IsCellEditingQuery, void 0)) return false;
      try {
        const result = commands.run(PasteRangeCommand, { payload: { plainText: text } });
        commands.run(SelectRangeCommand, { anchor: [...result.range.start], focus: [...result.range.end] });
      } catch (error) {
        platform.warn('Clipboard paste shortcut failed.', error);
      }
      return true;
    },
  });
  keyboard.subscribe({
    onCopy: () => {
      const selectedText = queries.has(ReadSelectedCellEditTextQuery)
        ? queries.run(ReadSelectedCellEditTextQuery, void 0) : null;
      if (selectedText !== null) {
        if (selectedText) void clipboard.write({ plainText: selectedText })
          .catch((error) => platform.warn('Clipboard text copy shortcut failed.', error));
        return;
      }
      try {
        const result = commands.run(CopyRangeCommand, void 0);
        void clipboard.write(result.payload).catch((error) => platform.warn('Clipboard copy write failed.', error));
      } catch (error) {
        platform.warn('Clipboard copy shortcut failed.', error);
      }
    },
    onCut: () => {
      const selectedText = queries.has(ReadSelectedCellEditTextQuery)
        ? queries.run(ReadSelectedCellEditTextQuery, void 0) : null;
      if (selectedText !== null) {
        if (!selectedText) return;
        pendingTextCut = clipboard.write({ plainText: selectedText })
          .then(() => {
            if (queries.run(ReadSelectedCellEditTextQuery, void 0) === selectedText) {
              commands.run(HandleDocumentInputCommand, { kind: 'delete' });
            }
          })
          .catch((error) => platform.warn('Clipboard text cut shortcut failed.', error));
        return;
      }
      try {
        const result = commands.run(CutRangeCommand, void 0);
        void clipboard.write(result.payload).catch((error) => platform.warn('Clipboard cut write failed.', error));
      } catch (error) {
        platform.warn('Clipboard cut shortcut failed.', error);
      }
    },
    onPaste: async (valuesOnly) => {
      try {
        if (pendingTextCut) {
          await pendingTextCut;
          pendingTextCut = null;
        }
        const payload = await clipboard.read();
        if (queries.has(IsCellEditingQuery) && queries.run(IsCellEditingQuery, void 0)) {
          if (payload?.plainText) commands.run(HandleDocumentInputCommand, {
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
          if (result.workbookMove) return;
          commands.run(SelectRangeCommand, {
            anchor: [result.range.start[0], result.range.start[1]],
            focus: [result.range.end[0], result.range.end[1]],
          });
        }
      } catch (error) {
        platform.warn('Clipboard paste shortcut failed.', error);
      }
    },
  });
}
