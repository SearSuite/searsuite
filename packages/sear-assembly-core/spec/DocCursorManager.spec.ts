import { DocCursorManager } from '../src/DocCursorManager';

describe('DocCursorManager', () => {
  let manager: DocCursorManager;

  beforeEach(() => {
    manager = new DocCursorManager();
  });

  it('should get and set cursor', () => {
    expect(manager.getCursor()).toBeNull();
    const info = { x: 10, y: 20, height: 15, visible: true };
    manager.setCursor(info);
    expect(manager.getCursor()).toBe(info);
  });

  it('should get and set selection rects', () => {
    expect(manager.getSelectionRects()).toEqual([]);
    const rects = [{ x: 0, y: 0, width: 10, height: 10 }];
    manager.setSelectionRects(rects);
    expect(manager.getSelectionRects()).toBe(rects);
  });

  it('should clear cursor and selection data', () => {
    manager.setCursor({ x: 10, y: 20, height: 15, visible: true });
    manager.setSelectionRects([{ x: 0, y: 0, width: 10, height: 10 }]);

    manager.clearCursor();

    expect(manager.getCursor()).toBeNull();
    expect(manager.getSelectionRects()).toEqual([]);
  });

  it('rejects retained cursor handles and direct writes after assembly', () => {
    let executing = false;
    const teardownToken = {};
    const info = { x: 10, y: 20, height: 15, visible: true };
    const rects = [{ x: 0, y: 0, width: 10, height: 10 }];
    manager.setCursor(info);
    manager.setSelectionRects(rects);
    manager.enforceCommandBoundary(() => executing, teardownToken);

    expect(() => { info.x = 99; }).not.toThrow();
    expect(manager.getCursor()?.x).toBe(10);
    expect(() => { rects[0]!.width = 99; }).not.toThrow();
    expect(manager.getSelectionRects()[0]?.width).toBe(10);
    expect(() => { manager.getCursor()!.x = 99; }).toThrow();
    expect(() => manager.getSelectionRects().push({ x: 1, y: 1, width: 1, height: 1 })).toThrow();
    expect(() => manager.setCursor(info)).toThrow('editor.commands.run');
    expect(() => manager.setSelectionRects(rects)).toThrow('editor.commands.run');
    expect(() => manager.clearCursor()).toThrow('editor.commands.run');
    expect((manager as unknown as Record<string, unknown>)['info']).toBeUndefined();
    expect((manager as unknown as Record<string, unknown>)['selectionRects']).toBeUndefined();
    expect(() => { (manager as unknown as Record<string, unknown>)['info'] = info; }).toThrow();

    executing = true;
    manager.setCursor(info);
    manager.setSelectionRects(rects);
    executing = false;
    expect(() => { manager.getSelectionRects()[0]!.width = 42; }).toThrow();
    manager.clearCursor(teardownToken);
    expect(manager.getCursor()).toBeNull();
    expect(() => manager.getSelectionRects().push(rects[0]!)).toThrow();
  });
});
