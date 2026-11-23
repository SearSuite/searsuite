import {
  RenderContext,
  type EventWithOffset,
  type RenderImageData,
  type RenderImageSource,
  type RenderPaint,
} from './RenderContext';

/** Render context that preserves engine state while producing no raster output. */
export class HeadlessRenderContext extends RenderContext {
  /** DI token for resolving the headless render context. */
  public static readonly symbol: symbol = Symbol.for('HeadlessRenderContext');

  private readonly attributes = new Map<string, string>();
  private viewScale = 1;
  private rasterScale = 1;
  private lineWidth = 1;

  /** @inheritdoc */
  public getRenderTarget(): unknown {
    return this;
  }
  /** @inheritdoc */
  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  /** @inheritdoc */
  public getAttribute(name: string): string {
    return this.attributes.get(name) ?? '';
  }
  /** @inheritdoc */
  public initialize(scale: number = 1): void {
    this.rasterScale = scale;
  }
  /** @inheritdoc */
  public resize(_width: number, _height: number, scale: number = this.rasterScale): void {
    this.rasterScale = scale;
    this.isDrawn = false;
  }
  /** @inheritdoc */
  public setViewScale(scale: number): void {
    this.viewScale = scale;
    this.isDrawn = false;
  }
  /** @inheritdoc */
  public getViewScale(): number {
    return this.viewScale;
  }
  /** @inheritdoc */
  public getRasterScale(): number {
    return this.rasterScale;
  }
  /** @inheritdoc */
  public save(): void {}
  /** @inheritdoc */
  public restore(): void {}
  /** @inheritdoc */
  public getRoot(): unknown {
    return this;
  }
  /** @inheritdoc */
  public addEventListener(_type: string, _callback: (event: EventWithOffset) => void): () => void {
    return () => void 0;
  }
  /** @inheritdoc */
  public addClickEventListener(_callback: (event: EventWithOffset) => void): void {}
  /** @inheritdoc */
  public removeClickEventListener(_callback: (event: EventWithOffset) => void): void {}
  /** @inheritdoc */
  public addMouseDownEventListener(_callback: (event: EventWithOffset) => void): void {}
  /** @inheritdoc */
  public removeMouseDownEventListener(_callback: (event: EventWithOffset) => void): void {}
  /** @inheritdoc */
  public addMouseMoveEventListener(_callback: (event: EventWithOffset) => void): void {}
  /** @inheritdoc */
  public removeMouseMoveEventListener(_callback: (event: EventWithOffset) => void): void {}
  /** @inheritdoc */
  public addMouseUpEventListener(_callback: (event: EventWithOffset) => void): void {}
  /** @inheritdoc */
  public removeMouseUpEventListener(_callback: (event: EventWithOffset) => void): void {}
  /** @inheritdoc */
  public addResizeListener(_callback: () => void): void {}
  /** @inheritdoc */
  public removeResizeListener(): void {}
  /** @inheritdoc */
  public beginPath(): void {}
  /** @inheritdoc */
  public closePath(): void {}
  /** @inheritdoc */
  public fill(): void {}
  /** @inheritdoc */
  public stroke(): void {}
  /** @inheritdoc */
  public rect(_x: number, _y: number, _width: number, _height: number): void {}
  /** @inheritdoc */
  public clearRect(_x: number, _y: number, _width: number, _height: number): void {}
  /** @inheritdoc */
  public strokeRect(_x: number, _y: number, _width: number, _height: number): void {}
  /** @inheritdoc */
  public setLineWidth(width: number): void {
    this.lineWidth = width;
  }
  /** @inheritdoc */
  public getLineWidth(): number {
    return this.lineWidth;
  }
  /** @inheritdoc */
  public getMaxLineWidth(): number {
    return this.lineWidth;
  }
  /** @inheritdoc */
  public setLineDash(_segments: number[]): void {}
  /** @inheritdoc */
  public setStrokeStyle(_strokeStyle: RenderPaint): void {}
  /** @inheritdoc */
  public setFillStyle(_fillStyle: RenderPaint): void {}
  /** @inheritdoc */
  public clip(): void {}
  /** @inheritdoc */
  public moveTo(_x: number, _y: number): void {}
  /** @inheritdoc */
  public lineTo(_x: number, _y: number): void {}
  /** @inheritdoc */
  public setFont(_font: string): void {}
  /** @inheritdoc */
  public fillText(_text: string, _x: number, _y: number, _maxWidth?: number): void {}
  /** @inheritdoc */
  public measureText(text: string): { width: number; height: number } {
    return { width: text.length, height: 0 };
  }
  /** @inheritdoc */
  public getImageData(
    _x: number,
    _y: number,
    width: number,
    height: number,
  ): RenderImageData {
    return { data: [], width, height };
  }
  /** @inheritdoc */
  public putImageData(
    _imageData: RenderImageData,
    _x: number,
    _y: number,
  ): void {}
  /** @inheritdoc */
  public drawImage(_image: RenderImageSource, _x: number, _y: number): void;
  /** @inheritdoc */
  public drawImage(_image: RenderImageSource, _x: number, _y: number, _width: number, _height: number): void;
  /** @inheritdoc */
  public drawImage(
    _image: RenderImageSource,
    _x: number,
    _y: number,
    _width: number,
    _height: number,
    _sx: number,
    _sy: number,
    _sWidth: number,
    _sHeight: number,
  ): void;
  /** @inheritdoc */
  public drawImage(..._args: unknown[]): void {}
  /** @inheritdoc */
  public translate(_x: number, _y: number): void {}
  /** @inheritdoc */
  public resetTransform(): void {}
  /** @inheritdoc */
  public setTransform(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number): void {}
  /** @inheritdoc */
  public cloneNode(): RenderContext {
    return new HeadlessRenderContext();
  }
  /** @inheritdoc */
  public createHitNode(): RenderContext {
    return new HeadlessRenderContext();
  }
}
