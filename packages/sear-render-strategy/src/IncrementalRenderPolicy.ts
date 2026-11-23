import { Injectable } from '@searsuite/sear-foundation-di';
import { type PositionRectProps } from '@searsuite/sear-foundation-rect';

export const IncrementalRenderDecisionReason = {
  Accepted: 'accepted',
  NotCandidate: 'not-candidate',
  EmptyViewport: 'empty-viewport',
  ExcessiveCopiedArea: 'excessive-copied-area',
  ExcessiveInvalidArea: 'excessive-invalid-area',
  ExcessiveCopyCount: 'excessive-copy-count',
  ExcessiveInvalidRectCount: 'excessive-invalid-rect-count',
} as const;

export type IncrementalRenderDecisionReason =
  (typeof IncrementalRenderDecisionReason)[keyof typeof IncrementalRenderDecisionReason];

/** Guardrails used to decide whether an incremental render plan is cheaper and safe enough to use. */
export interface IncrementalRenderPolicyLimits {
  /** Maximum total copied pixel area divided by viewport area. Values above 1 allow overlapping or repeated copies. */
  readonly maxCopiedAreaRatio: number;
  /** Maximum invalid redraw area divided by viewport area after raster copies have been applied. */
  readonly maxInvalidAreaRatio: number;
  /** Maximum number of raster copy rectangles allowed in one frame. */
  readonly maxCopyCount: number;
  /** Maximum number of invalid redraw rectangles allowed in one frame. */
  readonly maxInvalidRectCount: number;
}

/** Measured cost shape for one proposed incremental render frame. */
export interface IncrementalRenderCandidate {
  /** Viewport dimensions used as the baseline for area ratios. */
  readonly viewport: Pick<PositionRectProps, 'width' | 'height'>;
  /** Total destination pixel area copied from the retained/off-screen frame cache. */
  readonly copiedArea: number;
  /** Total world pixel area that still needs redraw after raster reuse. */
  readonly invalidArea: number;
  /** Number of raster copy rectangles in the candidate plan. */
  readonly copyCount: number;
  /** Number of invalid redraw rectangles in the candidate plan. */
  readonly invalidRectCount: number;
}

export interface IncrementalRenderDecision {
  readonly accepted: boolean;
  readonly reason: IncrementalRenderDecisionReason;
}

export const DEFAULT_INCREMENTAL_RENDER_POLICY_LIMITS: IncrementalRenderPolicyLimits = {
  maxCopiedAreaRatio: 1.5,
  maxInvalidAreaRatio: 1,
  maxCopyCount: 64,
  maxInvalidRectCount: 16,
};

/** Decides whether an incremental render candidate is worth using for the next frame. */
@Injectable()
export class IncrementalRenderPolicy {
  /** DI token for resolving IncrementalRenderPolicy. */
  public static readonly symbol = Symbol.for('IncrementalRenderPolicy');

  public evaluate(
    candidate: IncrementalRenderCandidate,
    limits: IncrementalRenderPolicyLimits = DEFAULT_INCREMENTAL_RENDER_POLICY_LIMITS,
  ): IncrementalRenderDecision {
    const viewportArea = candidate.viewport.width * candidate.viewport.height;
    if (viewportArea <= 0) return reject(IncrementalRenderDecisionReason.EmptyViewport);
    if (candidate.copyCount > limits.maxCopyCount) return reject(IncrementalRenderDecisionReason.ExcessiveCopyCount);
    if (candidate.invalidRectCount > limits.maxInvalidRectCount) {
      return reject(IncrementalRenderDecisionReason.ExcessiveInvalidRectCount);
    }
    if (candidate.copiedArea / viewportArea > limits.maxCopiedAreaRatio) {
      return reject(IncrementalRenderDecisionReason.ExcessiveCopiedArea);
    }
    if (candidate.invalidArea / viewportArea > limits.maxInvalidAreaRatio) {
      return reject(IncrementalRenderDecisionReason.ExcessiveInvalidArea);
    }
    return { accepted: true, reason: IncrementalRenderDecisionReason.Accepted };
  }
}

function reject(reason: IncrementalRenderDecisionReason): IncrementalRenderDecision {
  return { accepted: false, reason };
}
