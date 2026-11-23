export const createRenderContext = () => ({
  beginFrame: jest.fn(),
  beginNodeSemantics: jest.fn(),
  endNodeSemantics: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  beginPath: jest.fn(),
  rect: jest.fn(),
  clip: jest.fn(),
  setTransform: jest.fn(),
  clearRect: jest.fn(),
  drawImage: jest.fn(),
  getRenderTarget: jest.fn(() => ({})),
  getImageData: jest.fn(),
  getMaxLineWidth: jest.fn(() => 2),
  getViewScale: jest.fn(() => 1),
  requiresFrameRebuild: jest.fn(() => false),
  supportsDirtyRedraw: jest.fn(() => true),
  requiresExplicitNodeClear: jest.fn(() => true),
  resetHitFrame: jest.fn(),
  isDrawn: false,
});

export const createPositionRect = (width = 100, height = 80) => ({
  x: 0,
  y: 0,
  width,
  height,
  getSize: () => [width, height] as [number, number],
});

export const createScrollManager = (width = 100, height = 80) => ({
  subscribeScroll: jest.fn(),
  getShape: jest.fn(() => [width, height]),
  getPositionRect: jest.fn(() => createPositionRect(width, height)),
});

export const createTree = (width = 1000, height = 800) => ({
  getBoundary: jest.fn(() => ({ width, height })),
});

export const createDirtyTracker = (rects: Array<{ x: number; y: number; width: number; height: number }> = []) => ({
  query: jest.fn(() => rects),
  getBoundary: jest.fn(() => ({ x: 0, y: 0, width: 1000, height: 800 })),
  clear: jest.fn(),
});

export const createNode = (children: unknown[] = []) => ({
  query: jest.fn(() => children),
  getNodeByRandomColorKey: jest.fn(() => null),
});
