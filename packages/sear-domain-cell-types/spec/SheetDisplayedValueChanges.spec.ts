import { SheetDisplayedValueChanges } from '../src/SheetDisplayedValueChanges';

describe('SheetDisplayedValueChanges', () => {
  it('requires an editor command to publish and removes authority from later listeners', () => {
    const changes = new SheetDisplayedValueChanges(jest.fn());
    let commandExecuting = false;
    const authority: boolean[] = [];
    changes.subscribe(() => authority.push(commandExecuting));
    changes.enforceCommandBoundary(
      () => commandExecuting,
      (callback) => {
        const previous = commandExecuting;
        commandExecuting = false;
        try { return callback(); } finally { commandExecuting = previous; }
      },
    );
    expect((changes as unknown as { listeners?: unknown }).listeners).toBeUndefined();
    changes.subscribe(() => authority.push(commandExecuting));
    expect(() => changes.publish([{ row: 0, column: 0 }])).toThrow('editor.commands.run');
    commandExecuting = true;
    changes.publish([{ row: 0, column: 0 }]);
    expect(authority).toEqual([true, false]);
    expect(commandExecuting).toBe(true);
  });

  it('notifies independent subscribers, isolates listener failures, and disposes subscriptions', () => {
    const warn = jest.fn();
    const changes = new SheetDisplayedValueChanges(warn);
    const failing = jest.fn(() => { throw new Error('listener failed'); });
    const received = jest.fn();
    const disposeFailing = changes.subscribe(failing);
    const disposeReceived = changes.subscribe(received);
    const cells = [{ row: 1, column: 2 }];

    changes.publish(cells);
    expect(received).toHaveBeenCalledWith(cells);
    expect(warn).toHaveBeenCalledTimes(1);

    disposeFailing();
    disposeReceived();
    changes.publish(cells);
    expect(received).toHaveBeenCalledTimes(1);
    changes.dispose();
    changes.publish(cells);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
