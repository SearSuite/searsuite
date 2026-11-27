import { SheetEmbeddedEditorViewRegistry, type SheetEmbeddedEditorView } from '../src';

it('captures view callbacks separately and disposes contributions in reverse order', () => {
  const registry = new SheetEmbeddedEditorViewRegistry();
  const rendered = jest.fn(),
    replacement = jest.fn();
  const disposed: string[] = [];
  const view: SheetEmbeddedEditorView & { onRender: typeof rendered } = {
    key: 'first',
    onRender: rendered,
    dispose: () => disposed.push('first'),
  };
  registry.register(view);
  registry.register({ key: 'second', dispose: () => disposed.push('second') });
  view.onRender = replacement;
  registry.notifyRender({ needsRedraw: false }, {} as never);
  expect(rendered).toHaveBeenCalledTimes(1);
  expect(replacement).not.toHaveBeenCalled();
  registry.dispose();
  registry.dispose();
  expect(disposed).toEqual(['second', 'first']);
});

it('requires the owning command scope and reserves teardown for the adapter', () => {
  const registry = new SheetEmbeddedEditorViewRegistry();
  const dispose = jest.fn();
  registry.register({ key: 'test', dispose });
  const token = {};
  let executing = false;
  registry.enforceWriteBoundary(() => {
    if (!executing) throw new Error('command required');
  }, token);
  expect(() => registry.register({ key: 'other' })).toThrow('command required');
  expect(() => registry.notifyCommit([], {} as never)).toThrow('command required');
  expect(() => registry.dispose()).toThrow('command required');
  executing = true;
  registry.notifyCommit([], {} as never);
  executing = false;
  registry.dispose(token);
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('releases initialized and partially initialized views when startup fails', () => {
  const registry = new SheetEmbeddedEditorViewRegistry(),
    disposed: string[] = [];
  registry.register({ key: 'first', dispose: () => disposed.push('first') });
  registry.register({
    key: 'failure',
    initialize() {
      throw new Error('startup failed');
    },
    dispose: () => disposed.push('failure'),
  });
  expect(() => registry.initialize({} as never)).toThrow('startup failed');
  expect(disposed).toEqual(['failure', 'first']);
});
