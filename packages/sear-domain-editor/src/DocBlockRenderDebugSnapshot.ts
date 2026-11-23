export type DocBlockRenderFrameMode = 'rebuild' | 'full' | 'scroll' | 'block-copy' | 'skipped';

export interface DocBlockRenderDebugRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DocBlockRenderDebugCopy {
  readonly source: DocBlockRenderDebugRect;
  readonly destination: DocBlockRenderDebugRect;
}

export interface DocBlockRenderPolicyCandidateDebugMetrics {
  readonly copiedPixelArea: number;
  readonly invalidPixelArea: number;
  readonly copiedAreaRatio: number;
  readonly invalidAreaRatio: number;
  readonly copyCount: number;
  readonly invalidRectCount: number;
}

export interface DocBlockRenderDebugSnapshot {
  readonly frameMode: DocBlockRenderFrameMode;
  readonly incrementalRenderAccepted: boolean;
  readonly incrementalRenderReason: string;
  readonly incrementalRenderCandidate?: DocBlockRenderPolicyCandidateDebugMetrics;
  readonly changedBlocks: readonly DocBlockRenderDebugRect[];
  readonly shiftedBlocks: readonly DocBlockRenderDebugRect[];
  readonly reusedBlocks: readonly DocBlockRenderDebugRect[];
  readonly rasterCopies: readonly DocBlockRenderDebugCopy[];
  readonly invalidRedrawRects: readonly DocBlockRenderDebugRect[];
  readonly copiedPixelArea: number;
  readonly redrawnBlockCount: number;
  readonly skippedBlockCount: number;
}
