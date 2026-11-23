import {
  defineDocCommand,
  type DocCommandBus,
  type DocCommandContext,
  type DocCommandResult,
  type DocEditorCommand,
} from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-core';
import {
  SessionStateRestorePhase,
  defineSessionState,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import { defineStateObservation, type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { type ScrollManager, type ScrollManagerState } from '@searsuite/sear-render-scroll';

import { DocContentRenderPluginKey } from '@searsuite/sear-assembly-doc';
import { type DocEditorViewport } from './createDocEditor';
import { type DocRenderCoordinator } from './DocRenderCoordinator';
import { type DocViewportEnvironment } from './DocViewportEnvironment';

/** Internal adapter input for one platform-originated document scroll state update. */
export type DocViewportScrollInput = ScrollManagerState;

/** Local viewport position retained while remounting one document editor. */
export interface DocViewportSessionState {
  readonly x: number;
  readonly y: number;
}

/** Stable session-state identity owned by the document viewport assembly. */
export const DocViewportSessionStateDefinition = defineSessionState<DocViewportSessionState>('doc.viewport');

/** Current document viewport position exposed to hosts and plugins. */
export const DocViewportObservation = defineStateObservation<DocViewportSessionState>('doc.viewport');

/** Resizes the standalone document viewport. */
export const ResizeDocViewportCommand = defineDocCommand<DocEditorViewport>('doc.viewport.resize');
/** Scrolls the standalone document viewport to an absolute world position. */
export const ScrollDocViewportToCommand = defineDocCommand<DocViewportSessionState>('doc.viewport.scrollTo');
/** Applies one platform-originated document scroll update. */
export const ApplyDocViewportScrollCommand = defineDocCommand<DocViewportScrollInput>('doc.viewport.scroll');
/** Renders the document viewport after the committed scroll state changes. */
export const RenderDocViewportCommand = defineDocCommand<void>('doc.viewport.render');

/** Registers viewport-owned document commands on the editor command bus. */
export function registerDocViewportCommands(input: {
  readonly commands: DocCommandBus;
  readonly viewportEnvironment: DocViewportEnvironment;
  readonly renderCoordinator: DocRenderCoordinator;
  readonly scrollManager: ScrollManager;
}): void {
  input.commands.register(ResizeDocViewportCommand, function createDocViewportResizeCommand(size) {
    return createResizeDocViewportCommand(size, input.viewportEnvironment);
  });
  input.commands.register(ScrollDocViewportToCommand, function createDocViewportScrollToCommand({ x, y }) {
    return {
      id: ScrollDocViewportToCommand.id,
      execute(): DocCommandResult {
        return {
          pipeline: new Pipeline(ScrollDocViewportToCommand.id).addLocalAction(
            ScrollDocViewportToCommand.id,
            () => input.scrollManager.scrollTo(x, y),
          ),
        };
      },
    };
  });
  input.commands.register(ApplyDocViewportScrollCommand, function createDocViewportScrollCommand(update) {
    return createApplyDocViewportScrollCommand(update, input.scrollManager);
  });
  input.commands.register(RenderDocViewportCommand, function createDocViewportRenderCommand() {
    return createRenderDocViewportCommand(input.renderCoordinator);
  });
  input.scrollManager.setInputUpdateExecutor(function runDocViewportScrollCommand(update): void {
    input.commands.run(ApplyDocViewportScrollCommand, update);
  });
}

/** Registers viewport remount state and its host-facing observation. */
export function registerDocViewportState(
  session: SessionStateRegistry,
  observations: ObservationRegistry,
  scrollManager: ScrollManager,
): void {
  session.register(DocViewportSessionStateDefinition, {
    restorePhase: SessionStateRestorePhase.AfterInitialize,
    capture: () => readViewportState(scrollManager),
    restore: ({ x, y }) => scrollManager.scrollTo(x, y),
  });
  observations.register(DocViewportObservation, {
    getSnapshot: () => readViewportState(scrollManager),
    subscribe(listener) {
      return scrollManager.subscribeScroll(({ x, y }) => listener({ x, y }));
    },
  });
}

function readViewportState(scrollManager: ScrollManager): DocViewportSessionState {
  const { x, y } = scrollManager.getState();
  return { x, y };
}

function createResizeDocViewportCommand(
  size: DocEditorViewport,
  viewportEnvironment: DocViewportEnvironment,
): DocEditorCommand {
  return {
    id: ResizeDocViewportCommand.id,
    execute(_context: DocCommandContext): DocCommandResult {
      const pipeline = new Pipeline(ResizeDocViewportCommand.id);
      pipeline.addLocalAction(ResizeDocViewportCommand.id, function applyDocViewportResize(): void {
        viewportEnvironment.applyViewportResize(size);
      });
      pipeline.addRender(`${ResizeDocViewportCommand.id}:render`, DocContentRenderPluginKey);
      return { pipeline };
    },
  };
}

function createApplyDocViewportScrollCommand(update: DocViewportScrollInput, scrollManager: ScrollManager): DocEditorCommand {
  return {
    id: ApplyDocViewportScrollCommand.id,
    execute(_context: DocCommandContext): DocCommandResult {
      return {
        pipeline: new Pipeline(ApplyDocViewportScrollCommand.id).addLocalAction(
          ApplyDocViewportScrollCommand.id,
          () => scrollManager.applyInputScroll(update),
        ),
      };
    },
  };
}

function createRenderDocViewportCommand(renderCoordinator: DocRenderCoordinator): DocEditorCommand {
  return {
    id: RenderDocViewportCommand.id,
    execute(_context: DocCommandContext): DocCommandResult {
      return {
        pipeline: new Pipeline(RenderDocViewportCommand.id).addLocalAction(
          RenderDocViewportCommand.id,
          function renderDocViewport(): void {
            renderCoordinator.renderViewportScrollFrame();
          },
        ),
      };
    },
  };
}
