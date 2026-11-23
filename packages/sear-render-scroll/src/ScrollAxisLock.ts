import { ScrollAxisLockConfigError } from './ScrollAxisLockConfigError';

/** Axis selected for one continuous wheel or touch gesture. */
export type ScrollAxis = 'x' | 'y';

/** Host-tunable direction-lock parameters for DOM scrolling gestures. */
export interface ScrollAxisLockConfig {
  enabled: boolean;
  /** Accumulated pixels required before selecting the dominant axis. */
  activationThreshold: number;
  /** Wheel silence in milliseconds that separates two gestures. */
  wheelEndDelay: number;
}

const DEFAULT_CONFIG: ScrollAxisLockConfig = {
  enabled: true,
  activationThreshold: 1.5,
  wheelEndDelay: 48,
};

/** Locks a continuous input gesture to its first dominant axis. */
export class ScrollAxisLock {
  private config: ScrollAxisLockConfig = { ...DEFAULT_CONFIG };
  private axis: ScrollAxis | null = null;
  private pendingX = 0;
  private pendingY = 0;

  /** Applies validated host overrides and resets an in-progress gesture. */
  public configure(config: Partial<ScrollAxisLockConfig>): void {
    const next = { ...this.config, ...config };
    validateConfig(next);
    this.config = next;
    this.reset();
  }

  /** Returns the configured wheel gesture-end delay. */
  public getWheelEndDelay(): number {
    return this.config.wheelEndDelay;
  }

  /** Returns the currently selected axis, or null before activation. */
  public getAxis(): ScrollAxis | null {
    return this.axis;
  }

  /** Filters one two-dimensional input sample through the active direction lock. */
  public consume(x: number, y: number): { x: number; y: number } {
    if (!this.config.enabled) return { x, y };
    if (this.axis === 'x') return { x, y: 0 };
    if (this.axis === 'y') return { x: 0, y };

    this.pendingX += x;
    this.pendingY += y;
    if (Math.max(Math.abs(this.pendingX), Math.abs(this.pendingY)) < this.config.activationThreshold) {
      return { x: 0, y: 0 };
    }

    this.axis = Math.abs(this.pendingX) > Math.abs(this.pendingY) ? 'x' : 'y';
    const locked = this.axis === 'x' ? { x: this.pendingX, y: 0 } : { x: 0, y: this.pendingY };
    this.pendingX = 0;
    this.pendingY = 0;
    return locked;
  }

  /** Ends the current gesture and clears uncommitted sub-threshold input. */
  public reset(): void {
    this.axis = null;
    this.pendingX = 0;
    this.pendingY = 0;
  }
}

function validateConfig(config: ScrollAxisLockConfig): void {
  const invalid =
    typeof config.enabled !== 'boolean' ||
    !Number.isFinite(config.activationThreshold) ||
    config.activationThreshold < 0 ||
    !Number.isFinite(config.wheelEndDelay) ||
    config.wheelEndDelay < 0;
  if (invalid) {
    throw new ScrollAxisLockConfigError('Scroll-axis lock configuration contains an invalid value.', { config });
  }
}
