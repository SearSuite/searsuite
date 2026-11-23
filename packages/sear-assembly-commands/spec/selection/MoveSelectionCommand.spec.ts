import { moveSelection } from '../../src/selection/MoveSelectionCommand';

describe('MoveSelectionCommand', () => {
  const baseInput = {
    focus: [2, 2] as const,
    lastRow: 10,
    lastCol: 10,
    findMerge: () => undefined,
  };

  it('should move up', () => {
    const res = moveSelection({ ...baseInput, direction: 'up' });
    expect(res.focus).toEqual([1, 2]);
  });

  it('should move down', () => {
    const res = moveSelection({ ...baseInput, direction: 'down' });
    expect(res.focus).toEqual([3, 2]);
  });

  it('should move left', () => {
    const res = moveSelection({ ...baseInput, direction: 'left' });
    expect(res.focus).toEqual([2, 1]);
  });

  it('should move right', () => {
    const res = moveSelection({ ...baseInput, direction: 'right' });
    expect(res.focus).toEqual([2, 3]);
  });

  it('should jump to edge up', () => {
    const res = moveSelection({ ...baseInput, direction: 'up', jumpToEdge: true });
    expect(res.focus).toEqual([0, 2]);
  });

  it('should jump to edge down', () => {
    const res = moveSelection({ ...baseInput, direction: 'down', jumpToEdge: true });
    expect(res.focus).toEqual([10, 2]);
  });

  it('should jump to edge left', () => {
    const res = moveSelection({ ...baseInput, direction: 'left', jumpToEdge: true });
    expect(res.focus).toEqual([2, 0]);
  });

  it('should jump to edge right', () => {
    const res = moveSelection({ ...baseInput, direction: 'right', jumpToEdge: true });
    expect(res.focus).toEqual([2, 10]);
  });

  it('should respect merge cells', () => {
    const mergeInput = {
      ...baseInput,
      findMerge: (p: any) => {
        if (p[0] === 2 && p[1] === 2) {
          return { start: [2, 2], end: [3, 3] } as any;
        }
        if (p[0] === 1 && p[1] === 2) {
          return { start: [0, 2], end: [1, 3] } as any;
        }
        return undefined;
      },
    };
    const res = moveSelection({ ...mergeInput, direction: 'up' });
    expect(res.anchor).toEqual([0, 2]);
    expect(res.focus).toEqual([1, 3]);
  });
});
