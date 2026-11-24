import { ScrollManager, type ScrollManagerState } from '../src';

describe('', () => {
  let scrollState: ScrollManager;

  beforeEach(() => {
    scrollState = new ScrollManager(800, 600);
  });

  it('ScrollManager should initialize with given width and height', () => {
    expect(scrollState.getShape()).toEqual([800, 600]);
  });

  it('ScrollManager should initialize state correctly', () => {
    expect(scrollState.getState()).toEqual({
      x: 0,
      y: 0,
      deltaX: 0,
      deltaY: 0,
    });
  });

  it('rejects viewport writes when a retained manager has a forged command guard', () => {
    Object.assign(scrollState, { assertCommandWrite: () => void 0 });
    scrollState.enforceCommandBoundary(() => false);

    expect(() => scrollState.resize(400, 300)).toThrow('editor.commands.run');
    expect(scrollState.getShape()).toEqual([800, 600]);
  });

  it('does not let retained state or subscriber handles change the viewport', () => {
    const initial = scrollState.getState();
    expect(() => { initial.x = 90; }).toThrow();
    scrollState.setContentBoundary(100, 100);
    let published: ScrollManagerState | undefined;
    scrollState.subscribeScroll((state) => { published = state; });
    scrollState.scrollTo(12, 18);

    expect(() => { published!.y = 90; }).toThrow();
    expect(() => { scrollState.getPreviousState()!.x = 90; }).toThrow();
    expect(scrollState.getState()).toMatchObject({ x: 12, y: 18 });
  });

  it('ScrollManager should update its viewport shape on resize', () => {
    scrollState.setContentBoundary(800, 600);
    scrollState.setPosition(700, 500);

    scrollState.resize(400, 300);

    expect(scrollState.getShape()).toEqual([400, 300]);
    expect(scrollState.getState()).toMatchObject({
      x: 700,
      y: 500,
      deltaX: 0,
      deltaY: 0,
    });
  });

  it('ScrollManager should allow publishers to update state and notify subscribers', () => {
    // Set a content boundary so that clamping works
    scrollState.setContentBoundary(800, 600);

    // Like WebScroller: x/y stay at current, deltaX/deltaY describe the delta
    const basicState = { x: 0, y: 0, deltaX: -15, deltaY: -25 };
    const mockSubscriberCallback = jest.fn();
    scrollState.subscribeScroll(mockSubscriberCallback);

    scrollState.addPublisher((_manager, updateState) => {
      updateState(basicState);
      return () => void 0;
    });

    // ScrollManager.update() computes: x = min(max(-deltaX + oldX, 0), contentBoundary[0])
    // = min(max(-(-15) + 0, 0), 800) = min(15, 800) = 15
    expect(mockSubscriberCallback).toHaveBeenCalledWith(
      expect.objectContaining({ x: 15, y: 25, deltaX: -15, deltaY: -25 }),
    );
  });

  it('ScrollManager should add and clean up publishers', () => {
    const mockCleanup = jest.fn();
    const mockPublisher = jest.fn().mockReturnValue(mockCleanup);

    const stopPublisher = scrollState.addPublisher(mockPublisher);
    expect(mockPublisher).toHaveBeenCalledWith(scrollState, expect.any(Function));

    stopPublisher();
    stopPublisher();
    scrollState.destroy();
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it('routes platform publisher updates through the configured input executor', () => {
    const executor = jest.fn((state: ScrollManagerState) => scrollState.applyInputScroll(state));
    scrollState.setContentBoundary(100, 100);
    scrollState.setInputUpdateExecutor(executor);
    scrollState.addPublisher((_manager, updateState) => {
      updateState({ x: 0, y: 0, deltaX: -10, deltaY: -20 });
      return () => void 0;
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(scrollState.getState()).toMatchObject({ x: 10, y: 20 });
  });

  it('rejects invalid command scroll input without changing the viewport', () => {
    expect(() => scrollState.applyInputScroll({ x: 0, y: 0, deltaX: Number.NaN, deltaY: 0 })).toThrow();
    expect(scrollState.getState()).toMatchObject({ x: 0, y: 0 });
  });

  it('does not notify subscribers when a wheel update is clamped at a boundary', () => {
    scrollState.setContentBoundary(100, 100);
    const subscriber = jest.fn();
    scrollState.subscribeScroll(subscriber);

    const update = scrollState.applyInputScroll.bind(scrollState);
    update({ x: 0, y: 0, deltaX: 20, deltaY: 20 });

    expect(scrollState.getState()).toMatchObject({ x: 0, y: 0 });
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('does not notify subscribers when scrollTo resolves to the current position', () => {
    const subscriber = jest.fn();
    scrollState.subscribeScroll(subscriber);

    scrollState.scrollTo(0, 0);

    expect(subscriber).not.toHaveBeenCalled();
  });

  it('allows unbounded scrolling when contentBoundary is [0, 0] (falsy)', () => {
    scrollState.setContentBoundary(0, 0);
    const update = scrollState.applyInputScroll.bind(scrollState);

    update({ x: 0, y: 0, deltaX: -50, deltaY: -50 });

    expect(scrollState.getState()).toMatchObject({ x: 50, y: 50 });
  });

  it('ScrollManager can unsubscribe listeners and releases them on destroy', () => {
    const first = jest.fn();
    const second = jest.fn();
    const stopFirst = scrollState.subscribeScroll(first);
    scrollState.subscribeScroll(second);

    scrollState.scrollTo(10, 20);
    stopFirst();
    stopFirst();
    scrollState.scrollTo(30, 40);
    scrollState.destroy();
    scrollState.scrollTo(50, 60);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('can prepend scroll subscribers', () => {
    const sequence: number[] = [];
    const first = () => sequence.push(1);
    const second = () => sequence.push(2);

    scrollState.subscribeScroll(first);
    scrollState.subscribeScroll(second, true); // prepend

    scrollState.scrollTo(10, 20);
    expect(sequence).toEqual([2, 1]);
  });

  it('provides getPreviousState returning the last valid state', () => {
    expect(scrollState.getPreviousState()).toEqual(scrollState.getState());
    scrollState.scrollTo(10, 20);
    expect(scrollState.getPreviousState()).toMatchObject({ x: 0, y: 0 });
    expect(scrollState.getState()).toMatchObject({ x: 10, y: 20 });
  });

  it('tracks render scroll state for programmatic scrolls until marked rendered', () => {
    scrollState.scrollTo(10, 20);

    expect(scrollState.hasUnrenderedScroll()).toBe(true);
    expect(scrollState.getRenderScrollState()).toMatchObject({
      x: 10,
      y: 20,
      deltaX: -10,
      deltaY: -20,
    });

    scrollState.markScrollStateRendered();

    expect(scrollState.hasUnrenderedScroll()).toBe(false);
    expect(scrollState.getRenderScrollState()).toMatchObject({
      x: 10,
      y: 20,
      deltaX: 0,
      deltaY: 0,
    });
  });

  it('tracks render scroll state for publisher updates until marked rendered', () => {
    const update = scrollState.applyInputScroll.bind(scrollState);
    update({ x: 0, y: 0, deltaX: -15, deltaY: -25 });

    expect(scrollState.getState()).toMatchObject({ x: 15, y: 25 });
    expect(scrollState.getRenderScrollState()).toMatchObject({
      x: 15,
      y: 25,
      deltaX: -15,
      deltaY: -25,
    });
  });

  it('getPositionRect returns a PositionRect of viewport dimensions', () => {
    const rect = scrollState.getPositionRect();
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(800);
    expect(rect.height).toBe(600);
  });
});
