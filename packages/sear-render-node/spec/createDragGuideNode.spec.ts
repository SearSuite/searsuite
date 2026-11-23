import { createDragGuideNode } from '../src';

describe('createDragGuideNode', () => {
  it.each([
    { x1: 10, y1: 40, x2: 310, y2: 40 },
    { x1: 40, y1: 10, x2: 40, y2: 310 },
  ])('creates a nonblank overlay guide with shared styling', (line) => {
    const node = createDragGuideNode(line, { depth: 110 });
    expect(node.properties).toEqual(
      expect.objectContaining({
        stroke: 'rgba(56, 110, 246, 0.8)',
        strokeWidth: 2,
        lineDash: [6, 4],
        isEdit: true,
        skipHit: true,
      }),
    );
    expect(node.positionRect.width).toBeGreaterThan(0);
    expect(node.positionRect.height).toBeGreaterThan(0);
    const context = {
      save: jest.fn(),
      restore: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      setStrokeStyle: jest.fn(),
      setLineWidth: jest.fn(),
      setLineDash: jest.fn(),
      stroke: jest.fn(),
    };
    node.drawScene(context as never);
    expect(context.moveTo).toHaveBeenCalledWith(line.x1, line.y1);
    expect(context.lineTo).toHaveBeenCalledWith(line.x2, line.y2);
    expect(context.setLineDash).toHaveBeenCalledWith([6, 4]);
  });
});
