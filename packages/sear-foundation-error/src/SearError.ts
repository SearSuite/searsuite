/** Machine-readable context attached to framework errors. */
export type SearErrorDetails = Readonly<Record<string, unknown>>;

/**
 * Base class for errors intentionally exposed by SearSuite packages.
 *
 * Packages may throw this generic form while they do not need a more specific
 * public error type. Domain-specific subclasses override `code`.
 */
export class SearError extends Error {
  /** Stable machine-readable identifier for this error category. */
  public readonly code: string = 'SEAR_ERROR';

  /** Creates a SearError instance. */
  public constructor(message: string, public readonly details: SearErrorDetails = {}, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }

  /**
   * Reports this error with a compact, styled console header and diagnostics.
   * Returning the error keeps `throw new SearError(...).report()` ergonomic.
   */
  public report(): this {
    console.error(
      `%c ${this.name} %c ${this.code} %c ${this.message}`,
      'background:#b91c1c;color:#fff;font-weight:700;padding:2px 6px;border-radius:3px 0 0 3px;',
      'background:#7f1d1d;color:#fecaca;font-weight:700;padding:2px 6px;',
      'color:#b91c1c;font-weight:600;',
    );

    if (Object.keys(this.details).length > 0) {
      console.error('%c details', 'color:#7f1d1d;font-weight:700;', this.details);
    }
    if (this.stack) {
      console.error('%c stack', 'color:#6b7280;font-weight:700;', this.stack);
    }
    return this;
  }
}
