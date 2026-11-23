import { type RichDocNode } from './RichDocNode';

/** Supported paragraph line-spacing semantics. */
export type RichTextLineSpacingMode = 'auto' | 'multiple' | 'atLeast' | 'exact';

/** Persisted paragraph attribute keys owned by the paragraph feature. */
export const RichTextParagraphAttribute = {
  LineSpacing: 'lineSpacing',
  SpacingAfter: 'spacingAfter',
} as const;

/** Persisted or default line-spacing policy resolved by paragraph layout. */
export interface RichTextLineSpacing {
  readonly mode: RichTextLineSpacingMode;
  readonly value?: number;
}

/** Default paragraph layout values supplied by the owning document runtime. */
export interface RichTextParagraphLayoutDefaults {
  readonly lineSpacing: RichTextLineSpacing;
  readonly spacingAfter: number;
}

/** Resolved paragraph layout values consumed by line and block flow. */
export interface RichTextParagraphLayout {
  readonly lineSpacing: RichTextLineSpacing;
  readonly spacingAfter: number;
}

/** Neutral defaults for runtimes that do not configure document paragraph spacing. */
export const defaultRichTextParagraphLayoutDefaults: RichTextParagraphLayoutDefaults = {
  lineSpacing: { mode: 'auto' },
  spacingAfter: 0,
};

/** Resolves paragraph-owned overrides over the runtime defaults. */
export function resolveRichTextParagraphLayout(
  node: RichDocNode | undefined,
  defaults: RichTextParagraphLayoutDefaults = defaultRichTextParagraphLayoutDefaults,
): RichTextParagraphLayout {
  const attrs = node?.attrs ?? {};
  return {
    lineSpacing: parseRichTextLineSpacing(attrs[RichTextParagraphAttribute.LineSpacing]) ?? defaults.lineSpacing,
    spacingAfter:
      parseRichTextParagraphSpacing(attrs[RichTextParagraphAttribute.SpacingAfter]) ?? defaults.spacingAfter,
  };
}

/** Parses a persisted line-spacing override, returning null when invalid. */
export function parseRichTextLineSpacing(value: unknown): RichTextLineSpacing | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { mode?: unknown; value?: unknown };
  if (
    candidate.mode !== 'auto' &&
    candidate.mode !== 'multiple' &&
    candidate.mode !== 'atLeast' &&
    candidate.mode !== 'exact'
  ) {
    return null;
  }
  if (candidate.mode === 'auto') return { mode: 'auto' };
  const number = typeof candidate.value === 'number' && Number.isFinite(candidate.value) ? candidate.value : 0;
  if (number <= 0) return null;
  return { mode: candidate.mode, value: number };
}

/** Parses a persisted paragraph-spacing override, returning null when invalid. */
export function parseRichTextParagraphSpacing(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}
