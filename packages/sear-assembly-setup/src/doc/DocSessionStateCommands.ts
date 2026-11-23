import { Pipeline } from '@searsuite/sear-assembly-core';
import {
  defineDocCommand,
  type DocCommandContext,
  type DocCommandResult,
  type DocEditorCommand,
  type DocCommandBus,
} from '@searsuite/sear-assembly-commands';
import { type SessionStateRegistry } from '@searsuite/sear-assembly-plugin';

import { type DocSessionState } from './DocEditorContracts';

/** Result of capturing editor-local state for an in-memory document remount. */
export interface CaptureDocSessionStateCommandResult extends DocCommandResult {
  readonly sessionState: DocSessionState;
}

/** Captures every registered local document session contributor. */
export const CaptureDocSessionStateCommand = defineDocCommand<void, CaptureDocSessionStateCommandResult>(
  'doc.captureSessionState',
);

/** Registers the in-memory document session capture command. */
export function registerDocSessionStateCommands(commands: DocCommandBus, session: SessionStateRegistry): void {
  commands.register(CaptureDocSessionStateCommand, function createCaptureDocSessionStateCommand() {
    return new CaptureDocSessionStateSnapshotCommand(session);
  });
}

class CaptureDocSessionStateSnapshotCommand implements DocEditorCommand<CaptureDocSessionStateCommandResult> {
  public readonly id = CaptureDocSessionStateCommand.id;

  public constructor(private readonly session: SessionStateRegistry) {}

  public execute(_context: DocCommandContext): CaptureDocSessionStateCommandResult {
    return {
      pipeline: new Pipeline(this.id),
      sessionState: this.session.capture(),
    };
  }
}
