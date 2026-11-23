import { SearError } from '@searsuite/sear-foundation-error';

/** Stable public error raised for invalid scroll-axis lock configuration. */
export class ScrollAxisLockConfigError extends SearError {
  public readonly code = 'SEAR_SCROLL_INVALID_AXIS_LOCK_CONFIG';
}
