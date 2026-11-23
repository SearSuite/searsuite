import {
  IncrementalRenderDecisionReason,
  IncrementalRenderPolicy,
  type IncrementalRenderCandidate,
} from '../src';

describe('IncrementalRenderPolicy', () => {
  it('accepts a bounded incremental render candidate', () => {
    const policy = new IncrementalRenderPolicy();

    expect(policy.evaluate(createCandidate())).toEqual({
      accepted: true,
      reason: IncrementalRenderDecisionReason.Accepted,
    });
  });

  it('rejects candidates without a drawable viewport', () => {
    const policy = new IncrementalRenderPolicy();

    expect(policy.evaluate(createCandidate({ viewport: { width: 0, height: 100 } }))).toEqual({
      accepted: false,
      reason: IncrementalRenderDecisionReason.EmptyViewport,
    });
  });

  it('rejects candidates with too many copy rects', () => {
    const policy = new IncrementalRenderPolicy();

    expect(policy.evaluate(createCandidate({ copyCount: 65 }))).toEqual({
      accepted: false,
      reason: IncrementalRenderDecisionReason.ExcessiveCopyCount,
    });
  });

  it('rejects candidates with too many invalid redraw rects', () => {
    const policy = new IncrementalRenderPolicy();

    expect(policy.evaluate(createCandidate({ invalidRectCount: 17 }))).toEqual({
      accepted: false,
      reason: IncrementalRenderDecisionReason.ExcessiveInvalidRectCount,
    });
  });

  it('rejects candidates whose copied pixel area is too large for the viewport', () => {
    const policy = new IncrementalRenderPolicy();

    expect(policy.evaluate(createCandidate({ copiedArea: 16001 }))).toEqual({
      accepted: false,
      reason: IncrementalRenderDecisionReason.ExcessiveCopiedArea,
    });
  });

  it('rejects candidates whose invalid redraw area is too large for the viewport', () => {
    const policy = new IncrementalRenderPolicy();

    expect(policy.evaluate(createCandidate({ invalidArea: 10001 }))).toEqual({
      accepted: false,
      reason: IncrementalRenderDecisionReason.ExcessiveInvalidArea,
    });
  });

  it('accepts candidates within host-provided limits', () => {
    const policy = new IncrementalRenderPolicy();

    expect(
      policy.evaluate(createCandidate({ invalidArea: 9000 }), {
        maxCopiedAreaRatio: 1,
        maxInvalidAreaRatio: 1,
        maxCopyCount: 2,
        maxInvalidRectCount: 2,
      }),
    ).toEqual({
      accepted: true,
      reason: IncrementalRenderDecisionReason.Accepted,
    });
  });
});

function createCandidate(overrides: Partial<IncrementalRenderCandidate> = {}): IncrementalRenderCandidate {
  return {
    viewport: { width: 100, height: 100 },
    copiedArea: 4000,
    invalidArea: 1000,
    copyCount: 1,
    invalidRectCount: 1,
    ...overrides,
  };
}
