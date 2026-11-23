import { EditorLifecycleError, EditorLifecycleErrorCode, EditorLifecycleStack } from '../src';

describe('EditorLifecycleStack', () => {
  it('disposes resources once in reverse acquisition order', () => {
    const events: string[] = [];
    const stack = new EditorLifecycleStack();
    stack.add(() => events.push('container'));
    stack.add(() => events.push('runtime'));
    stack.add(() => events.push('plugin'));

    stack.dispose();
    stack.dispose();
    expect(events).toEqual(['plugin', 'runtime', 'container']);
  });

  it('continues disposing after a resource fails', () => {
    const events: string[] = [];
    const stack = new EditorLifecycleStack();
    stack.add(() => events.push('container'));
    stack.add(() => {
      events.push('runtime');
      throw new Error('runtime cleanup failed');
    });
    stack.add(() => events.push('plugin'));

    expect(() => stack.dispose()).toThrow('runtime cleanup failed');
    expect(events).toEqual(['plugin', 'runtime', 'container']);
  });

  it('reports closed stacks and multiple cleanup failures with stable public errors', () => {
    const stack = new EditorLifecycleStack();
    stack.add(() => {
      throw new Error('first cleanup failed');
    });
    stack.add(() => {
      throw new Error('second cleanup failed');
    });

    expect(() => stack.dispose()).toThrow(EditorLifecycleError);
    try {
      stack.add(() => void 0);
    } catch (error) {
      expect(error).toMatchObject({ code: EditorLifecycleErrorCode.StackDisposed });
    }

    const failingStack = new EditorLifecycleStack();
    failingStack.add(() => {
      throw new Error('first cleanup failed');
    });
    failingStack.add(() => {
      throw new Error('second cleanup failed');
    });
    try {
      failingStack.dispose();
    } catch (error) {
      expect(error).toMatchObject({
        code: EditorLifecycleErrorCode.MultipleDisposalFailures,
        details: { failureCount: 2 },
      });
    }
  });
});
