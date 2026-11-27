/** @jest-environment node */
import { StateKernel, StatePlugin, type StateKernelAdapter } from '../src';

type Change = { owner: string; value: number; fail?: boolean };
class NumberOwner extends StatePlugin<{ value: number }, Change> {
  readonly key: string;
  constructor(key: string) {
    super(Object.freeze({ value: 0 }));
    this.key = key;
  }
  apply(state: { value: number }, change: Change): { value: number } {
    state.value = change.value;
    if (change.fail) throw new Error('reducer failed');
    return state;
  }
}
function fixture() {
  const owners = [new NumberOwner('a'), new NumberOwner('b')];
  const token = {};
  owners.forEach((owner) => owner.enforceStateWriteBoundary(token));
  const adapter: StateKernelAdapter<NumberOwner, Change> = {
    forEachOwner(change, visit) {
      owners.filter((owner) => owner.key === change.owner).forEach(visit);
    },
    read: (owner) => owner.getState(),
    clone: (state) => ({ ...(state as { value: number }) }),
    apply: (owner, state, change) => owner.apply(state as { value: number }, change),
    prepare: (_owner, state) => Object.freeze(state),
    publish(states) {
      states.forEach((state, owner) => owner.setState(state as { value: number }, token));
    },
  };
  const errors: unknown[] = [];
  const kernel = new StateKernel<NumberOwner, Change>(adapter, (error) => errors.push(error));
  return { owners, kernel, adapter, errors };
}

describe('presentation-independent state kernel', () => {
  it('publishes multiple owners atomically and permits a view to detach and reattach', () => {
    const { kernel, owners } = fixture();
    const view = jest.fn(() => expect(owners.map((owner) => owner.getState().value)).toEqual([10, 20]));
    const dispose = kernel.subscribe(view);
    const batch = kernel.begin();
    batch.stage({ owner: 'a', value: 10 });
    batch.stage({ owner: 'b', value: 20 });
    expect(owners.map((owner) => owner.getState().value)).toEqual([0, 0]);
    const commit = kernel.commit(batch);
    expect(view).not.toHaveBeenCalled();
    kernel.notify(commit);
    expect(view).toHaveBeenCalledTimes(1);
    dispose();
    dispose();
    const next = kernel.begin();
    next.stage({ owner: 'a', value: 30 });
    kernel.notify(kernel.commit(next));
    expect(view).toHaveBeenCalledTimes(1);
    expect(owners[0].getState().value).toBe(30);
    const nextView = jest.fn();
    kernel.subscribe(nextView);
    const final = kernel.begin();
    final.stage({ owner: 'a', value: 40 });
    kernel.notify(kernel.commit(final));
    expect(nextView).toHaveBeenCalledTimes(1);
  });

  it('discards every staged owner when a later reducer fails', () => {
    const { kernel, owners } = fixture();
    const listener = jest.fn();
    kernel.subscribe(listener);
    const batch = kernel.begin();
    batch.stage({ owner: 'a', value: 10 });
    expect(() => batch.stage({ owner: 'b', value: 20, fail: true })).toThrow('reducer failed');
    expect(() => kernel.commit(batch)).toThrow('closed');
    expect(owners.map((owner) => owner.getState().value)).toEqual([0, 0]);
    expect(kernel.revision).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('prepares every owner before publishing and leaves state unchanged on preparation failure', () => {
    const { kernel, adapter, owners } = fixture();
    adapter.prepare = (owner, state) => {
      if (owner.key === 'b') throw new Error('invalid state');
      return state;
    };
    const batch = kernel.begin();
    batch.stage({ owner: 'a', value: 1 });
    batch.stage({ owner: 'b', value: 2 });
    expect(() => kernel.commit(batch)).toThrow('invalid state');
    expect(owners.map((owner) => owner.getState().value)).toEqual([0, 0]);
    expect(kernel.revision).toBe(0);
  });

  it('previews detached states without publishing or notifying', () => {
    const { kernel, owners } = fixture();
    const batch = kernel.begin();
    batch.stage({ owner: 'a', value: 1 });
    expect(batch.preview().get(owners[0])).toEqual({ value: 1 });
    expect(owners[0].getState().value).toBe(0);
    expect(kernel.revision).toBe(0);
    expect(() => kernel.commit(batch)).toThrow('closed');
  });

  it('rejects stale writes while permitting a nested publication to an unrelated owner', () => {
    const { kernel, owners } = fixture();
    const outer = kernel.begin();
    outer.stage({ owner: 'a', value: 1 });
    const inner = kernel.begin();
    inner.stage({ owner: 'b', value: 2 });
    kernel.notify(kernel.commit(inner));
    kernel.notify(kernel.commit(outer));
    expect(owners.map((owner) => owner.getState().value)).toEqual([1, 2]);
    const stale = kernel.begin();
    stale.stage({ owner: 'a', value: 3 });
    const newer = kernel.begin();
    newer.stage({ owner: 'a', value: 4 });
    kernel.notify(kernel.commit(newer));
    expect(() => kernel.commit(stale)).toThrow('obsolete');
    expect(owners[0].getState().value).toBe(4);
  });

  it('isolates observer errors and delivers nested commits in publication order', () => {
    const { kernel, owners, errors } = fixture();
    const seen: number[] = [];
    kernel.subscribe(() => {
      throw new Error('view failed');
    });
    kernel.subscribe((event) => {
      seen.push(event.revision);
      if (event.revision === 1) {
        const nested = kernel.begin();
        nested.stage({ owner: 'b', value: 2 });
        kernel.notify(kernel.commit(nested));
      }
    });
    const batch = kernel.begin();
    batch.stage({ owner: 'a', value: 1 });
    kernel.notify(kernel.commit(batch));
    expect(seen).toEqual([1, 2]);
    expect(errors).toHaveLength(2);
    expect(owners.map((owner) => owner.getState().value)).toEqual([1, 2]);
  });

  it('queues an inner post-commit publication until the enclosing publication is ready', () => {
    const { kernel } = fixture();
    const seen: number[] = [];
    kernel.subscribe((event) => seen.push(event.revision));
    const a = kernel.begin();
    a.stage({ owner: 'a', value: 1 });
    const first = kernel.commit(a);
    const b = kernel.begin();
    b.stage({ owner: 'b', value: 2 });
    const second = kernel.commit(b);
    kernel.notify(second);
    expect(seen).toEqual([]);
    kernel.notify(first);
    expect(seen).toEqual([1, 2]);
    expect(() => kernel.notify(first)).toThrow('already delivered');
  });

  it('rejects foreign batches and unauthorized state replacement', () => {
    const a = fixture(),
      b = fixture();
    const batch = a.kernel.begin();
    batch.stage({ owner: 'a', value: 1 });
    expect(() => b.kernel.commit(batch)).toThrow('another kernel');
    expect(() => a.owners[0].setState({ value: 99 })).toThrow('command transaction');
  });

  it('releases listeners and rejects new work after destruction', () => {
    const { kernel, owners } = fixture();
    const listener = jest.fn();
    kernel.subscribe(listener);
    const batch = kernel.begin();
    batch.stage({ owner: 'a', value: 1 });
    const commit = kernel.commit(batch);
    kernel.destroy();
    kernel.destroy();
    kernel.notify(commit);
    expect(listener).not.toHaveBeenCalled();
    expect(owners[0].getState().value).toBe(1);
    expect(() => kernel.begin()).toThrow('destroyed');
    expect(() => kernel.subscribe(listener)).toThrow('destroyed');
  });
});
