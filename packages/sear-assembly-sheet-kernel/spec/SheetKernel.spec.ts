import { ConfigEngine, defaultSheetConfig } from '@searsuite/sear-assembly-config';
import {
  Plugin,
  PluginKey,
  PluginManager,
  Pipeline,
  PipelineStepKind,
  PipelineStepExecutorRegistry,
  SheetInteractionStore,
  SheetInteractionReducerRegistry,
  type PipelineStepExecutor,
  type PluginStateRegistration,
} from '@searsuite/sear-assembly-plugin';
import { SheetDataEngine, SheetMatrix } from '@searsuite/sear-domain-sheet';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { createTransaction, type Transaction } from '@searsuite/sear-domain-transaction';
import { NodePlatform } from '@searsuite/sear-node-adapters';
import { SheetKernel, SheetOwnerLifecycle } from '../src';

class TestOwner<State> extends Plugin<State> {
  readonly #reduce: (state: State, transaction: Transaction) => State | null;
  readonly #expose: boolean;
  constructor(state: State, reduce: (state: State, transaction: Transaction) => State | null, expose = true) {
    super({ key: new PluginKey('test-owner'), state });
    this.#reduce = reduce;
    this.#expose = expose;
  }
  apply(state: State, transaction: Transaction): State | null {
    return this.#reduce(state, transaction);
  }
  registerState(): PluginStateRegistration<State> {
    return { key: this.key, state: this.getState(), dataEngine: { enabled: this.#expose } };
  }
}

function fixture(owners: Plugin<any>[] = [], customSteps: PipelineStepExecutor[] = []) {
  const platform = new NodePlatform(),
    manager = new PluginManager(platform),
    data = new SheetDataEngine();
  const config = new ConfigEngine(defaultSheetConfig),
    lifecycle = new SheetOwnerLifecycle();
  const steps = new PipelineStepExecutorRegistry();
  customSteps.forEach((step) => steps.register(step));
  const interactions = new SheetInteractionStore(new SheetInteractionReducerRegistry(), platform);
  owners.forEach((owner) => manager.registerPlugin(owner));
  const kernel = new SheetKernel(manager, data, config, interactions, steps, platform, lifecycle);
  jest.spyOn(platform, 'warn').mockImplementation(() => {});
  kernel.initialize();
  return { kernel, manager, data, config, lifecycle, platform, interactions };
}

function counter(expose = true) {
  return new TestOwner(
    { value: 0 },
    (state) => {
      state.value++;
      return state;
    },
    expose,
  );
}
function transaction(owner: Plugin<unknown>): Pipeline {
  return Pipeline.fromTransaction('test', createTransaction(owner.key));
}
const failingStep: PipelineStepExecutor = {
  kind: 'test.failure',
  execute() {
    throw new Error('staging failed');
  },
};

describe('SheetKernel state ownership', () => {
  it('initializes a real owner once and rejects writes to adopted state', () => {
    const owner = counter(),
      { kernel, manager, data } = fixture([owner]);
    kernel.initialize();
    expect(data.getDataType(owner.key)).toBe(owner.getState());
    expect(() => owner.setState({ value: 9 })).toThrow('command transaction');
    expect(() => {
      owner.getState().value = 9;
    }).toThrow();
    expect(() => manager.registerPlugin(counter())).toThrow('owning runtime');
  });
  it('publishes independent staged state and immutable commit metadata', () => {
    const owner = counter(),
      { kernel, data } = fixture([owner]);
    const before = owner.getState(),
      snapshots: unknown[] = [];
    kernel.subscribeCommits((snapshot) => snapshots.push(snapshot));
    kernel.executePipeline(transaction(owner));
    expect(before).toEqual({ value: 0 });
    expect(owner.getState()).toEqual({ value: 1 });
    expect(data.getDataType(owner.key)).toBe(owner.getState());
    expect(snapshots).toEqual([{ revision: 1, changedOwners: [owner.key.key] }]);
    expect(Object.isFrozen(kernel.getCommitSnapshot())).toBe(true);
    expect(Object.isFrozen(kernel.getCommitSnapshot().changedOwners)).toBe(true);
  });
  it('commits private owner state without adding a DataEngine registration', () => {
    const owner = counter(false),
      { kernel, data } = fixture([owner]);
    kernel.executePipeline(transaction(owner));
    expect(owner.getState()).toEqual({ value: 1 });
    expect(data.hasDataType(owner.key)).toBe(false);
  });
  it('reuses staged state across multiple transactions', () => {
    const owner = counter(),
      { kernel } = fixture([owner]);
    const pipeline = transaction(owner);
    pipeline.addTransaction('second', createTransaction(owner.key));
    kernel.executePipeline(pipeline);
    expect(owner.getState()).toEqual({ value: 2 });
    expect(kernel.getCommitSnapshot().revision).toBe(1);
  });
  it('leaves committed states and listeners unchanged when a later step fails', () => {
    const owner = counter(),
      { kernel, data } = fixture([owner], [failingStep]);
    const before = owner.getState(),
      listener = jest.fn();
    kernel.subscribePublications(listener);
    const pipeline = transaction(owner);
    pipeline.addCustom('fail', failingStep.kind);
    expect(() => kernel.executePipeline(pipeline)).toThrow('staging failed');
    expect(owner.getState()).toBe(before);
    expect(data.getDataType(owner.key)).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(kernel.getCommitSnapshot().revision).toBe(0);
  });
  it('rolls back all consumers when another owner reduction fails', () => {
    const owner = counter();
    const observer = new TestOwner({}, () => {
      throw new Error('observer failed');
    });
    observer.interestedIn = ['*'];
    const { kernel } = fixture([owner, observer]);
    const before = owner.getState();
    expect(() => kernel.executePipeline(transaction(owner))).toThrow('observer failed');
    expect(owner.getState()).toBe(before);
  });
  it('does not replace unchanged state', () => {
    const owner = new TestOwner({ value: 0 }, () => null),
      { kernel } = fixture([owner]);
    const before = owner.getState();
    kernel.executePipeline(transaction(owner));
    expect(owner.getState()).toBe(before);
  });
  it('rolls back nested plain data and arrays', () => {
    const owner = new TestOwner({ nested: { value: 1 }, array: [1] }, (state) => {
      state.nested.value++;
      state.array.push(2);
      return state;
    });
    const { kernel } = fixture([owner], [failingStep]),
      pipeline = transaction(owner);
    pipeline.addCustom('fail', failingStep.kind);
    expect(() => kernel.executePipeline(pipeline)).toThrow('staging failed');
    expect(owner.getState()).toEqual({ nested: { value: 1 }, array: [1] });
  });
  it.each([
    new Map(),
    new Set(),
    {
      get value() {
        return 1;
      },
    },
  ])('rejects unsupported mutable state during adoption: %p', (state) => {
    expect(() => fixture([new TestOwner(state, () => null)])).toThrow(/plain data|accessors/);
  });
  it('rolls back sparse cell state when a later step fails', () => {
    const matrix = new SheetMatrix(undefined, [2, 2]);
    matrix.addItem(0, 0, { type: 'string', value: 'old' });
    const owner = new SheetDataPlugin({ sheetData: matrix }),
      { kernel } = fixture([owner], [failingStep]);
    const pipeline = Pipeline.fromTransaction(
      'cell',
      createTransaction(owner.key, [
        { p: [0, 0], uc: { value: { type: 'string', value: 'new' }, prev: { type: 'string', value: 'old' } } },
      ]),
    );
    pipeline.addCustom('fail', failingStep.kind);
    expect(() => kernel.executePipeline(pipeline)).toThrow('staging failed');
    expect(owner.getState().sheetData.getItem(0, 0)?.value).toBe('old');
  });
});

describe('SheetKernel command authority and projections', () => {
  it('allows invalidation publications while rejecting writes outside its command bus', () => {
    const owner = counter(),
      { kernel } = fixture([owner]);
    let executing = false;
    kernel.enforceCommandBoundary(() => executing);
    expect(() => kernel.executePipeline(transaction(owner))).toThrow('editor.commands.run');
    kernel.executePipeline(Pipeline.fromInvalidation('refresh', owner.key));
    expect(owner.getState().value).toBe(0);
    executing = true;
    kernel.executePipeline(transaction(owner));
    expect(owner.getState().value).toBe(1);
    expect(() => kernel.enforceCommandBoundary(() => true)).toThrow('already installed');
  });
  it('rechecks authority for steps added or changed by pipeline hooks', () => {
    const { kernel } = fixture();
    kernel.enforceCommandBoundary(() => false);
    const change = jest.fn();
    const added = Pipeline.fromInvalidation('added', new PluginKey('refresh'));
    added.use({
      onStart: (pipeline) => {
        pipeline.addLocalAction('write', change);
      },
    });
    expect(() => kernel.executePipeline(added)).toThrow('editor.commands.run');
    const changed = Pipeline.fromInvalidation('changed', new PluginKey('refresh'));
    changed.use({
      onStepStart: (step) => {
        step.kind = PipelineStepKind.LocalAction;
        step.localAction = change;
      },
    });
    expect(() => kernel.executePipeline(changed)).toThrow('editor.commands.run');
    expect(change).not.toHaveBeenCalled();
  });
  it('rejects a transaction hidden inside an invalidation executor', () => {
    const owner = counter(),
      { kernel } = fixture(
        [owner],
        [
          {
            kind: PipelineStepKind.Invalidate,
            execute(context) {
              context.executeTransaction({
                name: 'hidden',
                kind: PipelineStepKind.Transaction,
                transaction: createTransaction(owner.key),
              });
            },
          },
        ],
      );
    kernel.enforceCommandBoundary(() => false);
    expect(() => kernel.executePipeline(Pipeline.fromInvalidation('hidden', owner.key))).toThrow('editor.commands.run');
    expect(owner.getState().value).toBe(0);
  });
  it('previews dependent owner transactions without publishing or notifying', () => {
    const owner = counter(),
      projected = counter();
    projected.projectTransaction = (_state, tx) =>
      tx.pluginKey === owner.key ? [createTransaction(projected.key, [{ p: [0], ri: ['projected'] }])] : [];
    const { kernel } = fixture([owner, projected]);
    const listener = jest.fn();
    kernel.subscribePublications(listener);
    const states = kernel.previewTransactionStates([createTransaction(owner.key)]);
    expect(states.get(owner.key)).toEqual({ value: 1 });
    expect(states.get(projected.key)).toEqual({ value: 1 });
    expect(owner.getState().value).toBe(0);
    expect(projected.getState().value).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });
  it('requires command authority for previews', () => {
    const owner = counter(),
      { kernel } = fixture([owner]);
    kernel.enforceCommandBoundary(() => false);
    expect(() => kernel.previewTransactionStates([createTransaction(owner.key)])).toThrow('editor.commands.run');
  });
  it('keeps prerequisite operations in the pipeline and rolls back every owner', () => {
    const owner = counter(),
      projected = counter();
    projected.projectTransaction = (_state, tx) =>
      tx.pluginKey === owner.key ? [createTransaction(projected.key, [{ p: [0], ri: ['projected'] }])] : [];
    const { kernel } = fixture([owner, projected], [failingStep]),
      pipeline = transaction(owner);
    pipeline.addCustom('fail', failingStep.kind);
    expect(() => kernel.executePipeline(pipeline)).toThrow('staging failed');
    expect(pipeline.steps.filter((step) => step.transaction).map((step) => step.transaction!.pluginKey)).toEqual([
      projected.key,
      owner.key,
    ]);
    expect(owner.getState().value).toBe(0);
    expect(projected.getState().value).toBe(0);
  });
});

describe('SheetKernel commit and lifecycle ordering', () => {
  it('notifies owner derived state before committed consumers', () => {
    const owner = counter(),
      order: string[] = [];
    owner.onTransactionCommitted = () => {
      order.push('owner');
    };
    const { kernel } = fixture([owner]);
    kernel.subscribePublications(() => order.push('consumer'));
    const pipeline = transaction(owner);
    pipeline.addPostCommit('effect', () => {
      order.push('effect');
    });
    kernel.executePipeline(pipeline);
    expect(order).toEqual(['effect', 'owner', 'consumer']);
  });
  it('keeps a successful commit when post-commit or subscriber work fails', () => {
    const owner = counter(),
      { kernel, platform } = fixture([owner]),
      warn = jest.spyOn(platform, 'warn').mockImplementation(() => {});
    const listener = jest.fn();
    kernel.subscribePublications(() => {
      throw new Error('subscriber failed');
    });
    kernel.subscribePublications(listener);
    const pipeline = transaction(owner);
    pipeline.addPostCommit('fail', () => {
      throw new Error('effect failed');
    });
    kernel.executePipeline(pipeline);
    expect(owner.getState().value).toBe(1);
    expect(listener).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
  it('rolls back prepared resources in reverse order after staging fails', () => {
    const { kernel } = fixture([], [failingStep]),
      order: string[] = [],
      pipeline = new Pipeline('prepare');
    pipeline.addPreparedAction('first', () => () => {
      order.push('first');
    });
    pipeline.addPreparedAction('second', () => () => {
      order.push('second');
    });
    pipeline.addCustom('fail', failingStep.kind);
    expect(() => kernel.executePipeline(pipeline)).toThrow('staging failed');
    expect(order).toEqual(['second', 'first']);
  });
  it('starts business controllers once and destroys all in reverse order', () => {
    const { kernel, lifecycle } = fixture(),
      order: string[] = [];
    lifecycle.register({
      start: () => {
        order.push('start1');
      },
      destroy: () => {
        order.push('destroy1');
      },
    });
    lifecycle.register({
      start: () => {
        order.push('start2');
      },
      destroy: () => {
        order.push('destroy2');
      },
    });
    kernel.start();
    kernel.start();
    kernel.destroy();
    kernel.destroy();
    expect(order).toEqual(['start1', 'start2', 'destroy2', 'destroy1']);
    expect(() => lifecycle.register({ start() {}, destroy() {} })).toThrow('composition');
  });
  it('reserves destruction for its editor and detaches publication subscribers', () => {
    const { kernel } = fixture(),
      token = {};
    kernel.enforceTeardownBoundary(token);
    expect(() => kernel.destroy()).toThrow('editor owner');
    kernel.destroy(token);
    expect(() => kernel.enforceTeardownBoundary({})).toThrow('already installed');
  });
});
