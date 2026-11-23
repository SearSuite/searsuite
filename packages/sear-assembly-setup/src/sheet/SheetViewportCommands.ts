import { defineSheetCommand, LocalActionCommand, SheetCommandBus } from '@searsuite/sear-assembly-commands';
import {
  SessionStateRegistry,
  SessionStateRestorePhase,
  defineSessionState,
} from '@searsuite/sear-assembly-plugin';
import { ScrollManager, type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { SheetViewportResizeController } from '@searsuite/sear-assembly-core';
import { SheetZoomSessionStateDefinition } from '@searsuite/sear-plugin-zoom';

/** Public programmatic input for an absolute world-space viewport position. */
export interface SheetScrollToInput {
  readonly x: number;
  readonly y: number;
}

/** Internal adapter input for one platform-originated scroll state update. */
export type SheetScrollInput = ScrollManagerState;

/** Local viewport position retained while remounting one workbook sheet. */
export interface SheetViewportSessionState {
  readonly x: number;
  readonly y: number;
}

/** Stable session-state identity owned by the Sheet viewport assembly. */
export const SheetViewportSessionStateDefinition = defineSessionState<SheetViewportSessionState>('sheet.viewport');

export const ScrollViewportToCommand = defineSheetCommand<SheetScrollToInput>('view.scrollTo');
export const ApplyViewportScrollCommand = defineSheetCommand<SheetScrollInput>('view.scroll');
export const ResizeSheetViewportCommand = defineSheetCommand<{ readonly width: number; readonly height: number }>('view.resize');

/** Registers viewport-owned commands on the editor command bus. */
export function registerSheetViewportCommands(
  commands: SheetCommandBus,
  scrollManager: ScrollManager,
  resizeController: SheetViewportResizeController,
): void {
  commands.register(ScrollViewportToCommand, function createScrollViewportToCommand({ x, y }) {
    return new LocalActionCommand(ScrollViewportToCommand.id, function scrollViewportToPosition(): void {
      scrollManager.scrollTo(x, y);
    });
  });
  commands.register(ApplyViewportScrollCommand, function createApplyViewportScrollCommand(update) {
    return new LocalActionCommand(ApplyViewportScrollCommand.id, () => scrollManager.applyInputScroll(update));
  });
  commands.register(ResizeSheetViewportCommand, function createResizeSheetViewportCommand({ width, height }) {
    return new LocalActionCommand(ResizeSheetViewportCommand.id, () => resizeController.applyViewportResize(width, height));
  });
  resizeController.setResizeExecutor((size) => commands.run(ResizeSheetViewportCommand, size));
  scrollManager.setScrollToExecutor((x, y) => commands.run(ScrollViewportToCommand, { x, y }));
  scrollManager.setInputUpdateExecutor(function runApplyViewportScrollCommand(update): void {
    commands.run(ApplyViewportScrollCommand, update);
  });
}

/** Registers viewport-owned local remount state with the editor-local registry. */
export function registerSheetViewportSessionState(
  registry: SessionStateRegistry,
  scrollManager: ScrollManager,
): void {
  registry.register(SheetViewportSessionStateDefinition, {
    restorePhase: SessionStateRestorePhase.AfterInitialize,
    restoreAfter: [SheetZoomSessionStateDefinition],
    capture: () => {
      const { x, y } = scrollManager.getState();
      return { x, y };
    },
    restore: ({ x, y }) => scrollManager.scrollTo(x, y),
  });
}
