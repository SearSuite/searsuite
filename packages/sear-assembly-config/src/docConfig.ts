/** Configuration owned by a standalone Doc editor. */
export interface DocConfig {
  readonly devicePixelRatio: number;
  readonly docFontSize: number;
  readonly docFontFamily: string;
  /** Default paragraph line-height multiplier used by standalone Doc. */
  readonly docLineHeightMultiplier: number;
  /** Default paragraph spacing after each non-final block. */
  readonly docParagraphSpacingAfter: number;
  readonly docVerticalAlign: 'top' | 'center';
  readonly incrementalRenderPolicyLimits: IncrementalRenderPolicyLimitsConfig;
}

/** Guardrails for accepting an incremental document render plan. */
export interface IncrementalRenderPolicyLimitsConfig {
  readonly maxCopiedAreaRatio: number;
  readonly maxInvalidAreaRatio: number;
  readonly maxCopyCount: number;
  readonly maxInvalidRectCount: number;
}

/** Built-in defaults for standalone Doc editors. */
export const defaultDocConfig: DocConfig = {
  devicePixelRatio: 1,
  docFontSize: 16,
  docFontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  docLineHeightMultiplier: 1.15,
  docParagraphSpacingAfter: 8,
  docVerticalAlign: 'top',
  incrementalRenderPolicyLimits: {
    maxCopiedAreaRatio: 1.5,
    maxInvalidAreaRatio: 1,
    maxCopyCount: 64,
    maxInvalidRectCount: 16,
  },
};
