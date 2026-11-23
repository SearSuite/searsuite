import { SearError } from '@searsuite/sear-foundation-error';

export const CollaborationChannelErrorCode = {
  BoundaryInstalled: 'SEAR_COLLABORATION_BOUNDARY_INSTALLED',
  AttachmentConflict: 'SEAR_COLLABORATION_ATTACHMENT_CONFLICT',
  ContributorConflict: 'SEAR_COLLABORATION_CONTRIBUTOR_CONFLICT',
  Destroyed: 'SEAR_COLLABORATION_CHANNEL_DESTROYED',
} as const;

export type CollaborationChannelErrorCode =
  (typeof CollaborationChannelErrorCode)[keyof typeof CollaborationChannelErrorCode];

/** Stable public failures raised by a collaboration channel host. */
export class CollaborationChannelError extends SearError {
  public override readonly code: CollaborationChannelErrorCode;

  public constructor(code: CollaborationChannelErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message, details);
    this.code = code;
  }
}
