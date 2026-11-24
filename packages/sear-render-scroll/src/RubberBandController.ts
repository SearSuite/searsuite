import { Platform } from '@searsuite/sear-foundation-platform';
import { RubberBandConfigError } from './RubberBandConfigError';

/** Host-tunable parameters for Safari-style boundary resistance and return motion. */
export interface RubberBandConfig {
  enabled: boolean;
  /** Initial slope of the rubber-band curve. Lower values reduce sensitivity. */
  resistance: number;
  /** Fraction of touch resistance used for wheel input at a boundary. */
  wheelResistanceScale?: number;
  /** Wheel displacement limit as a multiple of the viewport size. */
  wheelMaxViewportScale?: number;
  /** Touch displacement limit in viewport pixels. */
  maxOffset: number;
  /** Default delay used when release is called without an explicit delay. */
  returnDelay: number;
  /** Spring mass used by the damped harmonic return motion. */
  springMass: number;
  /** Spring stiffness used by the damped harmonic return motion. */
  springStiffness: number;
  /** Viscous damping used by the damped harmonic return motion. */
  springDamping: number;
}

/** Transient visual displacement in viewport pixels. */
export interface RubberBandOffset {
  readonly x: number;
  readonly y: number;
}

/** One logical input sample consumed by RubberBandController. */
export interface RubberBandInput {
  readonly position: RubberBandOffset;
  readonly boundary: RubberBandOffset;
  readonly viewport: RubberBandOffset;
  /** Content displacement: positive values move the visible surface right/down. */
  readonly displacement: RubberBandOffset;
  readonly source?: 'wheel' | 'touch';
  /** Keeps an already scheduled return alive for same-direction input. */
  readonly continueReturnOnOutwardInput?: boolean;
}

/** Overscroll motion contract consumed by host scrollers. */
export interface RubberBandMotion {
  configure(config: Partial<RubberBandConfig>): void;
  getOffset(): RubberBandOffset;
  consume(input: RubberBandInput): RubberBandOffset;
  release(delay?: number, preserveVelocity?: boolean): void;
  reset(): void;
}

interface AxisMotion {
  excess: number;
  offset: number;
  velocity: number;
}

const DEFAULT_CONFIG: Required<RubberBandConfig> = {
  enabled: true,
  resistance: 0.55,
  wheelResistanceScale: 0.08,
  wheelMaxViewportScale: 100,
  maxOffset: 144,
  returnDelay: 24,
  springMass: 1,
  springStiffness: 144,
  // Critical damping for a responsive but less abrupt return spring.
  springDamping: 2 * Math.sqrt(144),
};

const MAX_FRAME_SECONDS = 0.032;
const SETTLE_OFFSET = 0.1;
const SETTLE_VELOCITY = 1;

/**
 * Platform-neutral Safari-style overscroll physics.
 *
 * Logical positions never leave their boundaries. Raw excess input is mapped
 * to a visual displacement with WebKit's viewport-relative resistance curve,
 * then returned by a damped harmonic spring during wheel input or after touch release.
 */
export class RubberBandController implements RubberBandMotion {
  readonly #platform: Platform;
  readonly #publishOffset: (offset: RubberBandOffset) => void;

  #config: Required<RubberBandConfig> = { ...DEFAULT_CONFIG };
  readonly #x: AxisMotion = { excess: 0, offset: 0, velocity: 0 };
  readonly #y: AxisMotion = { excess: 0, offset: 0, velocity: 0 };
  #viewport: RubberBandOffset = { x: 1, y: 1 };
  #overscrollScale = 1;
  #overscrollSource: 'wheel' | 'touch' = 'touch';
  #returnFrame: number | null = null;
  #returnTimer: number | null = null;
  #lastInputTime: number | null = null;
  #previousFrameTime: number | null = null;

  /** Creates one controller and publishes every visual displacement change. */
  public constructor(
    platform: Platform,
    publishOffset: (offset: RubberBandOffset) => void,
  ) {
    this.#platform = platform;
    this.#publishOffset = publishOffset;
  }

  /** Applies validated host overrides and resets immediately when disabled. */
  public configure(config: Partial<RubberBandConfig>): void {
    const next = { ...this.#config, ...config };
    validateConfig(next);
    this.#config = next;
    if (!next.enabled) this.reset();
  }

  /** Returns a copy of the current transient visual displacement. */
  public getOffset(): RubberBandOffset {
    return { x: this.#x.offset, y: this.#y.offset };
  }

  /**
   * Consumes one wheel or touch sample and returns a clamped logical position.
   * Reversing direction first consumes existing excess before logical scrolling resumes.
   */
  public consume(input: RubberBandInput): RubberBandOffset {
    this.#viewport = {
      x: Math.max(1, input.viewport.x),
      y: Math.max(1, input.viewport.y),
    };
    if (!this.#config.enabled) {
      return {
        x: clamp(input.position.x - input.displacement.x, 0, input.boundary.x),
        y: clamp(input.position.y - input.displacement.y, 0, input.boundary.y),
      };
    }

    const previousOffset = this.getOffset();
    const preserveReturn =
      input.continueReturnOnOutwardInput === true &&
      this.#returnFrame !== null &&
      this.#isOutwardInput(input.displacement);
    if (preserveReturn) this.#restoreExcessFromOffset();
    else this.#stopReturn(true);
    const nextSource = input.source === 'wheel' ? 'wheel' : 'touch';
    const nextScale = nextSource === 'wheel' ? this.#config.wheelResistanceScale : 1;
    if (nextSource !== this.#overscrollSource) {
      this.#x.excess =
        inverseRubberBandDistance(this.#x.offset, this.#maximumOffset(this.#viewport.x), this.#config.resistance) /
        nextScale;
      this.#y.excess =
        inverseRubberBandDistance(this.#y.offset, this.#maximumOffset(this.#viewport.y), this.#config.resistance) /
        nextScale;
      this.#overscrollScale = nextScale;
      this.#overscrollSource = nextSource;
    }
    const immediateWheelReverse = input.source === 'wheel';
    const x = this.#consumeAxis(
      this.#x,
      input.position.x,
      input.boundary.x,
      input.displacement.x,
      this.#viewport.x,
      immediateWheelReverse,
    );
    const y = this.#consumeAxis(
      this.#y,
      input.position.y,
      input.boundary.y,
      input.displacement.y,
      this.#viewport.y,
      immediateWheelReverse,
    );
    if (preserveReturn) this.#lastInputTime = this.#platform.now();
    else this.#recordInputVelocity(previousOffset);
    this.#publish();
    return { x, y };
  }

  /** Starts the boundary return after the configured input-settle delay. */
  public release(delay: number = this.#config.returnDelay, preserveVelocity: boolean = false): void {
    if (!this.#config.enabled || !this.#hasDisplacement()) return;
    if (this.#returnFrame !== null) return;
    if (this.#returnTimer !== null) {
      if (delay > 0) return;
      this.#platform.clearTimeout(this.#returnTimer);
      this.#returnTimer = null;
    }
    if (!preserveVelocity) {
      this.#x.velocity = inwardReturnVelocity(this.#x.offset, this.#config.springStiffness, this.#config.springMass);
      this.#y.velocity = inwardReturnVelocity(this.#y.offset, this.#config.springStiffness, this.#config.springMass);
    }
    if (delay <= 0) {
      this.#startReturn();
      return;
    }
    this.#returnTimer = this.#platform.setTimeout(this.#startReturn.bind(this), delay);
  }

  /** Cancels pending work and restores the exact zero-displacement state. */
  public reset(): void {
    this.#stopReturn(false);
    this.#resetAxis(this.#x);
    this.#resetAxis(this.#y);
    this.#lastInputTime = null;
    this.#overscrollScale = 1;
    this.#overscrollSource = 'touch';
    this.#publish();
  }

  #consumeAxis(
    axis: AxisMotion,
    position: number,
    boundary: number,
    displacement: number,
    viewport: number,
    immediateWheelReverse: boolean,
  ): number {
    if (
      immediateWheelReverse &&
      (axis.excess * displacement > 0 || (axis.excess === 0 && axis.offset * displacement < 0))
    ) {
      axis.excess = 0;
      axis.offset *= Math.exp(-Math.abs(displacement) / viewport);
      if (Math.abs(axis.offset) < SETTLE_OFFSET) axis.offset = 0;
    }
    const requested = position + axis.excess - displacement;
    const bounded = clamp(requested, 0, Math.max(0, boundary));
    axis.excess = requested - bounded;
    if (axis.excess !== 0) {
      axis.offset =
        -Math.sign(axis.excess) *
        rubberBandDistanceWithMaximum(
          Math.abs(axis.excess) * this.#overscrollScale,
          this.#maximumOffset(viewport),
          this.#config.resistance,
        );
    } else if (!immediateWheelReverse) {
      axis.offset = 0;
    }
    return bounded;
  }

  #recordInputVelocity(previous: RubberBandOffset): void {
    const now = this.#platform.now();
    const elapsed = this.#lastInputTime === null ? 1 / 60 : clamp((now - this.#lastInputTime) / 1000, 1 / 240, 0.05);
    this.#x.velocity = smoothVelocity(this.#x.velocity, (this.#x.offset - previous.x) / elapsed);
    this.#y.velocity = smoothVelocity(this.#y.velocity, (this.#y.offset - previous.y) / elapsed);
    if (this.#x.offset === 0) this.#x.velocity = 0;
    if (this.#y.offset === 0) this.#y.velocity = 0;
    this.#lastInputTime = now;
  }

  #startReturn(): void {
    this.#returnTimer = null;
    if (this.#returnFrame !== null || !this.#hasDisplacement()) return;
    this.#previousFrameTime = null;
    this.#returnFrame = this.#platform.requestAnimationFrame(this.#runReturnFrame.bind(this));
  }

  #runReturnFrame(time: number): void {
    this.#returnFrame = null;
    const elapsed =
      this.#previousFrameTime === null ? 1 / 60 : clamp((time - this.#previousFrameTime) / 1000, 0, MAX_FRAME_SECONDS);
    this.#previousFrameTime = time;
    this.#advanceSpring(this.#x, elapsed);
    this.#advanceSpring(this.#y, elapsed);

    if (isSettled(this.#x) && isSettled(this.#y)) {
      this.reset();
      return;
    }
    this.#publish();
    this.#returnFrame = this.#platform.requestAnimationFrame(this.#runReturnFrame.bind(this));
  }

  #advanceSpring(axis: AxisMotion, elapsed: number): void {
    if (elapsed <= 0) return;
    const { springMass, springStiffness, springDamping } = this.#config;
    const position = axis.offset;
    const velocity = axis.velocity;
    const naturalFrequency = Math.sqrt(springStiffness / springMass);
    const decay = springDamping / (2 * springMass);
    const discriminant = decay * decay - naturalFrequency * naturalFrequency;

    if (Math.abs(discriminant) < 1e-8) {
      const coefficient = velocity + decay * position;
      const envelope = Math.exp(-decay * elapsed);
      axis.offset = (position + coefficient * elapsed) * envelope;
      axis.velocity = (velocity - decay * coefficient * elapsed) * envelope;
      return;
    }

    if (discriminant < 0) {
      const dampedFrequency = Math.sqrt(-discriminant);
      const phase = dampedFrequency * elapsed;
      const sine = Math.sin(phase);
      const cosine = Math.cos(phase);
      const envelope = Math.exp(-decay * elapsed);
      const coefficient = (velocity + decay * position) / dampedFrequency;
      axis.offset = envelope * (position * cosine + coefficient * sine);
      axis.velocity =
        envelope *
        (velocity * cosine -
          ((decay * velocity + naturalFrequency * naturalFrequency * position) / dampedFrequency) * sine);
      return;
    }

    const root = Math.sqrt(discriminant);
    const firstRate = -decay + root;
    const secondRate = -decay - root;
    const firstWeight = (velocity - secondRate * position) / (firstRate - secondRate);
    const secondWeight = position - firstWeight;
    const firstEnvelope = Math.exp(firstRate * elapsed);
    const secondEnvelope = Math.exp(secondRate * elapsed);
    axis.offset = firstWeight * firstEnvelope + secondWeight * secondEnvelope;
    axis.velocity = firstWeight * firstRate * firstEnvelope + secondWeight * secondRate * secondEnvelope;
  }

  #stopReturn(preserveCurrentOffset: boolean): void {
    const wasReturning = this.#returnFrame !== null;
    if (this.#returnTimer !== null) this.#platform.clearTimeout(this.#returnTimer);
    if (this.#returnFrame !== null) this.#platform.cancelAnimationFrame(this.#returnFrame);
    this.#returnTimer = null;
    this.#returnFrame = null;
    this.#previousFrameTime = null;
    if (preserveCurrentOffset && wasReturning) {
      this.#restoreExcessFromOffset();
      // A new gesture should derive velocity from its own samples, not from
      // the spring that was interrupted.
      this.#x.velocity = 0;
      this.#y.velocity = 0;
    }
  }

  #isOutwardInput(displacement: RubberBandOffset): boolean {
    return (
      (this.#x.offset !== 0 && displacement.x !== 0 && this.#x.offset * displacement.x > 0) ||
      (this.#y.offset !== 0 && displacement.y !== 0 && this.#y.offset * displacement.y > 0)
    );
  }

  #hasDisplacement(): boolean {
    return this.#x.offset !== 0 || this.#y.offset !== 0;
  }

  #restoreExcessFromOffset(): void {
    this.#x.excess =
      inverseRubberBandDistance(this.#x.offset, this.#maximumOffset(this.#viewport.x), this.#config.resistance) /
      this.#overscrollScale;
    this.#y.excess =
      inverseRubberBandDistance(this.#y.offset, this.#maximumOffset(this.#viewport.y), this.#config.resistance) /
      this.#overscrollScale;
  }

  #maximumOffset(viewport: number): number {
    return this.#overscrollSource === 'wheel'
      ? Math.max(1, viewport * this.#config.wheelMaxViewportScale)
      : resolveMaximumOffset(viewport, this.#config.maxOffset);
  }

  #resetAxis(axis: AxisMotion): void {
    axis.excess = 0;
    axis.offset = 0;
    axis.velocity = 0;
  }

  #publish(): void {
    this.#publishOffset(this.getOffset());
  }
}

/** Safari-like rubber-band mapping with a smooth maximum visual displacement. */
export function rubberBandDistance(
  excess: number,
  viewport: number,
  resistance: number = 0.55,
  maxOffset: number = 144,
): number {
  return rubberBandDistanceWithMaximum(excess, resolveMaximumOffset(viewport, maxOffset), resistance);
}

function rubberBandDistanceWithMaximum(excess: number, maximum: number, resistance: number): number {
  const distance = Math.max(0, excess);
  return distance === 0 ? 0 : maximum / (1 + maximum / (resistance * distance));
}

function inverseRubberBandDistance(offset: number, maximum: number, resistance: number): number {
  if (offset === 0) return 0;
  const magnitude = Math.min(Math.abs(offset), maximum * (1 - 1e-9));
  const excess = (magnitude * maximum) / (resistance * (maximum - magnitude));
  return -Math.sign(offset) * excess;
}

function resolveMaximumOffset(viewport: number, maxOffset: number): number {
  return Math.max(1, Math.min(maxOffset, Math.max(1, viewport) * 0.3));
}

function smoothVelocity(previous: number, sample: number): number {
  return previous * 0.35 + sample * 0.65;
}

function inwardReturnVelocity(offset: number, stiffness: number, mass: number): number {
  if (offset === 0) return 0;
  const naturalFrequency = Math.sqrt(stiffness / mass);
  return -Math.sign(offset) * Math.abs(offset) * naturalFrequency * 0.75;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isSettled(axis: AxisMotion): boolean {
  return Math.abs(axis.offset) < SETTLE_OFFSET && Math.abs(axis.velocity) < SETTLE_VELOCITY;
}

function validateConfig(config: Required<RubberBandConfig>): void {
  const invalid =
    typeof config.enabled !== 'boolean' ||
    !Number.isFinite(config.resistance) ||
    config.resistance <= 0 ||
    config.resistance > 1 ||
    !Number.isFinite(config.wheelResistanceScale) ||
    config.wheelResistanceScale <= 0 ||
    config.wheelResistanceScale > 1 ||
    !Number.isFinite(config.wheelMaxViewportScale) ||
    config.wheelMaxViewportScale <= 0 ||
    !Number.isFinite(config.maxOffset) ||
    config.maxOffset <= 0 ||
    !Number.isFinite(config.returnDelay) ||
    config.returnDelay < 0 ||
    !Number.isFinite(config.springMass) ||
    config.springMass <= 0 ||
    !Number.isFinite(config.springStiffness) ||
    config.springStiffness <= 0 ||
    !Number.isFinite(config.springDamping) ||
    config.springDamping < 0;
  if (invalid) {
    throw new RubberBandConfigError('Rubber-band configuration contains an invalid physics value.', {
      config,
    });
  }
}
