import { SearError } from '@searsuite/sear-foundation-error';

/** Stable public error raised for invalid rubber-band physics configuration. */
export class RubberBandConfigError extends SearError {
  public readonly code = 'SEAR_SCROLL_INVALID_RUBBER_BAND_CONFIG';
}
