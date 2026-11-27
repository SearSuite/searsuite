import { Container, Injectable } from '@searsuite/sear-foundation-di';
import { NodePlatform } from '@searsuite/sear-node-adapters';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { createEmptySheetDocumentState, type SheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import {
  HeadlessRenderContext,
  HeadlessOffScreenRenderContext,
  HeadlessHitRenderContext,
} from '@searsuite/sear-render-context';
import { HeadlessEventRegistrar } from '@searsuite/sear-render-event-engine';
import {
  KeyboardRouter,
  HeadlessKeyboardRouter,
  HeadlessTextInput,
  HeadlessPointerCapture,
  type KeyboardRouterHandlers,
} from '@searsuite/sear-render-input';
import { HeadlessScroller } from '@searsuite/sear-render-scroll';
import { HeadlessCursorEngine } from '@searsuite/sear-render-cursor';
import { HeadlessToolbar } from '@searsuite/sear-assembly-plugin';
import { HeadlessCollabTransport } from '@searsuite/sear-plugin-collab';
import { SheetCellEditorPlugin } from '@searsuite/sear-plugin-cell-editor';
import { SheetCellEditorView } from '@searsuite/sear-render';
import { createSheetEditor, type SheetEditorConfiguration } from '../../src';

@Injectable()
class TestKeyboard extends HeadlessKeyboardRouter {
  public handlers: KeyboardRouterHandlers = {};
  public override subscribe(handlers: KeyboardRouterHandlers): void {
    Object.assign(this.handlers, handlers);
  }
}

/** Uses real commands, state, and views with host I/O supplied by headless adapters. */
export function createSheetEditorHarness(
  populate?: (state: SheetDocumentState) => void,
  configuration: Partial<SheetEditorConfiguration> = {},
) {
  let container: Container | undefined;
  const state = createEmptySheetDocumentState(8, 8);
  populate?.(state);
  const editor = createSheetEditor({
    viewport: { width: 600, height: 400 },
    sheetState: state,
    ...configuration,
    adapters: {
      platform: NodePlatform,
      createRenderContexts: () => ({
        renderContext: new HeadlessRenderContext(),
        offScreenRenderContext: new HeadlessOffScreenRenderContext(),
        hitRenderContext: new HeadlessHitRenderContext(),
      }),
      scroller: HeadlessScroller,
      eventRegistrar: HeadlessEventRegistrar,
      textInput: HeadlessTextInput,
      keyboardRouter: TestKeyboard,
      pointerCapture: HeadlessPointerCapture,
      cursorEngine: HeadlessCursorEngine,
      collabTransport: HeadlessCollabTransport,
      toolbar: HeadlessToolbar,
      registerEnvironment: (value) => {
        container = value;
      },
    },
  });
  const services = container!;
  return {
    editor,
    container: services,
    owner: services.resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol),
    view: services.resolve<SheetCellEditorView>(SheetCellEditorView.symbol),
    core: services.resolve<SearCoreSheet>(SearCoreSheet.symbol),
    keyboard: services.resolve<TestKeyboard>(KeyboardRouter.symbol),
  };
}
