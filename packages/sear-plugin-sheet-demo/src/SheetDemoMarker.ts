import { SearError } from '@searsuite/sear-foundation-error';

/** Canonical persisted values owned by the demo feature. */
export const SheetDemoMarker = {
  Review: 'review',
  Approved: 'approved',
} as const;

export type SheetDemoMarker = (typeof SheetDemoMarker)[keyof typeof SheetDemoMarker];

export function assertSheetDemoMarker(value: unknown): asserts value is SheetDemoMarker {
  if (value !== SheetDemoMarker.Review && value !== SheetDemoMarker.Approved) {
    throw new SearError('Invalid sheet demo marker.', { value });
  }
}
