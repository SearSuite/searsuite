import { HeadlessHitRenderContext, HeadlessOffScreenRenderContext, HeadlessRenderContext } from '../src';

describe('HeadlessRenderContext', () => {
  it('preserves render state, exposes neutral measurements, and accepts the full render contract', () => {
    const context = new HeadlessRenderContext();
    const defaultContext = new HeadlessRenderContext();
    const eventHandler = jest.fn();
    const resizeHandler = jest.fn();
    const image = {} as CanvasImageSource;
    const imageData = {
      data: [] as [number, number, number, number][],
      width: 2,
      height: 3,
    };

    expect(context.getRenderTarget()).toBe(context);
    defaultContext.initialize();
    expect(defaultContext.getRasterScale()).toBe(1);
    context.setAttribute('role', 'test');
    expect(context.getAttribute('role')).toBe('test');
    expect(context.getAttribute('missing')).toBe('');
    context.initialize(2);
    context.resize(100, 80);
    expect(context.getRasterScale()).toBe(2);
    context.resize(100, 80, 3);
    context.setViewScale(1.5);
    expect(context.getViewScale()).toBe(1.5);
    expect(context.getRasterScale()).toBe(3);
    expect(context.isDrawn).toBe(false);
    expect(context.getRoot()).toBe(context as unknown as EventTarget);

    context.save();
    context.restore();
    context.beginPath();
    context.closePath();
    context.fill();
    context.stroke();
    context.rect(1, 2, 3, 4);
    context.clearRect(1, 2, 3, 4);
    context.strokeRect(1, 2, 3, 4);
    context.setLineWidth(5);
    context.setLineDash([1, 2]);
    context.setStrokeStyle('red');
    context.setFillStyle('blue');
    context.clip();
    context.moveTo(0, 0);
    context.lineTo(1, 1);
    context.setFont('12px sans-serif');
    context.fillText('text', 1, 2, 20);
    context.putImageData(imageData, 0, 0);
    context.drawImage(image, 0, 0);
    context.drawImage(image, 0, 0, 1, 1);
    context.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
    context.translate(1, 2);
    context.resetTransform();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.beginFrame();
    context.beginNodeSemantics({ owner: 'test', role: 'node' });
    context.endNodeSemantics();
    context.resetHitFrame(20, 10);
    context.addEventListener('click', eventHandler);
    context.addClickEventListener(eventHandler);
    context.removeClickEventListener(eventHandler);
    context.addMouseDownEventListener(eventHandler);
    context.removeMouseDownEventListener(eventHandler);
    context.addMouseMoveEventListener(eventHandler);
    context.removeMouseMoveEventListener(eventHandler);
    context.addMouseUpEventListener(eventHandler);
    context.removeMouseUpEventListener(eventHandler);
    context.addResizeListener(resizeHandler);
    context.removeResizeListener();

    expect(context.getLineWidth()).toBe(5);
    expect(context.getMaxLineWidth()).toBe(5);
    expect(context.measureText('text')).toEqual({ width: 4, height: 0 });
    expect(context.getImageData(0, 0, 2, 3)).toEqual(imageData);
    expect(context.cloneNode()).toBeInstanceOf(HeadlessRenderContext);
    expect(context.createHitNode()).toBeInstanceOf(HeadlessRenderContext);
    expect(context.requiresFrameRebuild()).toBe(false);
    expect(context.supportsDirtyRedraw()).toBe(true);
    expect(context.requiresExplicitNodeClear()).toBe(true);
  });

  it('provides distinct typed markers for headless off-screen and hit layers', () => {
    const offScreen = new HeadlessOffScreenRenderContext();
    const hit = new HeadlessHitRenderContext();

    expect(offScreen).toBeInstanceOf(HeadlessRenderContext);
    expect(hit).toBeInstanceOf(HeadlessRenderContext);
    expect(HeadlessOffScreenRenderContext.symbol).not.toBe(HeadlessHitRenderContext.symbol);
  });
});
