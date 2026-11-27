import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import {
  Pipeline,
  PipelineStepKind,
  isInsideCommandExecution,
  runInsideCommandExecution,
} from '@searsuite/sear-assembly-plugin';

import {
  CommandExecutionPhase,
  TransactionPipelineCommand,
  PipelineExecutionCommand,
  LocalActionCommand,
  SheetCommandBus,
  DocCommandBus,
  EffectCommand,
  SheetCommandDispatcher,
  type SheetCommand,
  type DocCommandResult,
  extendSelection,
  moveSelection,
  selectRange,
  createSheetTransaction,
  defineSheetCommand,
  defineDocCommand,
  type SheetCommandDefinition,
  type DocCommandDefinition,
} from '../src';

const noMerge = () => void 0;

function executePipelineWithLocalActions(pipeline: Pipeline): void {
  pipeline.steps.forEach((step) => step.localAction?.());
}

function createWarningPlatform() {
  return { warn: jest.fn() };
}

describe('sheet commands', () => {
  it('exports stable command execution phase strings', () => {
    expect(CommandExecutionPhase).toEqual({
      Started: 'started',
      Completed: 'completed',
      Failed: 'failed',
    });
  });

  it('normalizes a range across chained merged regions', () => {
    const findMerge = ([row, col]: readonly [number, number]) => {
      if (row >= 1 && row <= 2 && col >= 1 && col <= 2)
        return {
          start: [1, 1] as [number, number],
          end: [2, 2] as [number, number],
        };
      if (row >= 2 && row <= 3 && col >= 3 && col <= 4)
        return {
          start: [2, 3] as [number, number],
          end: [3, 4] as [number, number],
        };
      return void 0;
    };

    expect(selectRange({ start: [2, 0], end: [2, 3], findMerge })).toEqual({
      anchor: [1, 0],
      focus: [3, 4],
    });
  });

  it('moves over merged-cell boundaries and extends selection to an edge', () => {
    const findMerge = ([row, col]: readonly [number, number]) =>
      row === 1 && col === 1 ? { start: [1, 1] as [number, number], end: [2, 2] as [number, number] } : void 0;

    expect(
      moveSelection({
        focus: [1, 1],
        direction: 'right',
        lastRow: 9,
        lastCol: 9,
        findMerge,
      }),
    ).toEqual({ anchor: [1, 3], focus: [1, 3] });
    expect(
      extendSelection({
        origin: [1, 1],
        cursor: [1, 1],
        direction: 'down',
        lastRow: 9,
        lastCol: 9,
        jumpToEdge: true,
        findMerge: noMerge,
      }),
    ).toEqual({ anchor: [1, 1], focus: [9, 1], cursor: [9, 1] });
  });

  it('surfaces non-converging merge providers through test guard errors', () => {
    let calls = 0;
    const run = () =>
      selectRange({
        start: [0, 0],
        end: [0, 0],
        findMerge: () => {
          calls++;
          if (calls > 1000) throw new Error('Test merge provider did not converge.');
          return {
            start: [0, 0],
            end: [calls, calls],
          };
        },
      });

    expect(run).toThrow('Test merge provider did not converge.');
    expect(calls).toBe(1001);
  });

  it('executes transaction pipelines before effects and preserves operation payloads', () => {
    const key = new PluginKey('command');
    const command = new TransactionPipelineCommand(
      'sheet.resizeColumns',
      createSheetTransaction(key, [{ p: [0], [MatrixOTActionName.ResizeCol]: { value: 140, prev: 100 } }]),
    );
    const executePipeline = jest.fn();
    const applyEffect = jest.fn();

    new SheetCommandDispatcher().execute({ executePipeline, applyEffect }, command);

    expect(executePipeline).toHaveBeenCalledTimes(1);
    const pipeline = executePipeline.mock.calls[0]?.[0] as Pipeline;
    expect(pipeline.steps[0]?.kind).toBe(PipelineStepKind.Transaction);
    expect(pipeline.steps[0]?.transaction?.operations).toEqual([
      { p: [0], [MatrixOTActionName.ResizeCol]: { value: 140, prev: 100 } },
    ]);
    expect(applyEffect).not.toHaveBeenCalled();
  });

  it('passes a history group through a transaction pipeline command', () => {
    const group = { id: 'clear-rules', phase: 'begin' as const };
    const command = new TransactionPipelineCommand(
      'cellHighlight.clearRules',
      createSheetTransaction(new PluginKey('highlight'), []),
      group,
    );
    expect(command.execute({ executePipeline: jest.fn(), applyEffect: jest.fn() }).historyGroup).toEqual(group);
  });

  it('allows effect-only commands', () => {
    expect(
      new EffectCommand([{ kind: 'focus-editor' }]).execute({
        executePipeline: () => void 0,
        applyEffect: () => void 0,
      }),
    ).toMatchObject({ effects: [{ kind: 'focus-editor' }] });
  });

  it('preserves standalone transaction construction helpers', () => {
    const key = new PluginKey('adapter');
    expect(
      createSheetTransaction(key, [{ p: [0], [MatrixOTActionName.ResizeRow]: { value: 30, prev: 24 } }]),
    ).toMatchObject({
      pluginKey: key,
      operations: [{ p: [0], [MatrixOTActionName.ResizeRow]: { value: 30, prev: 24 } }],
    });
  });

  it('executes named commands through the bound command bus and reports lifecycle events', () => {
    const executePipeline = jest.fn();
    const events: string[] = [];
    const completedResults: Pipeline[] = [];
    const bus = new SheetCommandBus();
    bus.bind({ executePipeline, applyEffect: () => void 0 });
    bus.subscribe((event) => {
      events.push(`${event.phase}:${event.id}`);
      if (event.phase === CommandExecutionPhase.Completed && event.result) completedResults.push(event.result.pipeline);
    });
    const Command = defineSheetCommand('feature.emptyTransaction');
    bus.register(
      Command,
      () => new TransactionPipelineCommand(Command.id, createSheetTransaction(new PluginKey('command'), [])),
    );
    bus.run(Command, void 0);

    expect(executePipeline).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(2);
    expect(events[0]).toBe('started:feature.emptyTransaction');
    expect(events[1]).toBe('completed:feature.emptyTransaction');
    expect(completedResults).toEqual([executePipeline.mock.calls[0]?.[0]]);
  });

  it('runs sheet lifecycle observers without mutation authority', () => {
    const bus = new SheetCommandBus();
    bus.bind({ executePipeline: executePipelineWithLocalActions, applyEffect: () => void 0 });
    const observed: Array<[CommandExecutionPhase, boolean]> = [];
    bus.subscribe((event) => observed.push([event.phase, bus.isExecuting()]));
    const Success = defineSheetCommand('sheet.lifecycle.success');
    const Failure = defineSheetCommand('sheet.lifecycle.failure');
    bus.register(Success, () => new LocalActionCommand(Success.id, () => void 0));
    bus.register(
      Failure,
      () =>
        new LocalActionCommand(Failure.id, () => {
          throw new Error('failed');
        }),
    );

    bus.run(Success, void 0);
    expect(() => bus.run(Failure, void 0)).toThrow('failed');
    expect(observed).toEqual([
      [CommandExecutionPhase.Started, false],
      [CommandExecutionPhase.Completed, false],
      [CommandExecutionPhase.Started, false],
      [CommandExecutionPhase.Failed, false],
    ]);
    expect(bus.isExecuting()).toBe(false);
  });

  it('reports asynchronous command completion only after its effect settles', async () => {
    const bus = new SheetCommandBus();
    bus.bind({ executePipeline: executePipelineWithLocalActions, applyEffect: () => void 0 });
    const Command = defineSheetCommand('sheet.lifecycle.async');
    const phases: CommandExecutionPhase[] = [];
    let resolve!: () => void;
    const completion = new Promise<void>((finish) => {
      resolve = finish;
    });
    bus.subscribe((event) => phases.push(event.phase));
    bus.register(Command, () => ({
      id: Command.id,
      execute: () => ({ pipeline: new Pipeline(Command.id), completion }),
    }));

    bus.run(Command, void 0);
    expect(phases).toEqual([CommandExecutionPhase.Started]);
    resolve();
    await completion;
    await Promise.resolve();
    expect(phases).toEqual([CommandExecutionPhase.Started, CommandExecutionPhase.Completed]);
    expect(bus.isExecuting()).toBe(false);
  });

  it('reports rejected asynchronous command effects as failed', async () => {
    const bus = new SheetCommandBus();
    bus.bind({ executePipeline: executePipelineWithLocalActions, applyEffect: () => void 0 });
    const Command = defineSheetCommand('sheet.lifecycle.asyncFailure');
    const phases: CommandExecutionPhase[] = [];
    const error = new Error('connection failed');
    let reject!: (reason: Error) => void;
    const completion = new Promise<void>((_, fail) => {
      reject = fail;
    });
    bus.subscribe((event) => phases.push(event.phase));
    bus.register(Command, () => ({
      id: Command.id,
      execute: () => ({ pipeline: new Pipeline(Command.id), completion }),
    }));

    bus.run(Command, void 0);
    reject(error);
    await expect(completion).rejects.toBe(error);
    await Promise.resolve();
    expect(phases).toEqual([CommandExecutionPhase.Started, CommandExecutionPhase.Failed]);
  });

  it('requires lifecycle observers to dispatch their own command for writes', () => {
    const bus = new SheetCommandBus();
    bus.bind({ executePipeline: executePipelineWithLocalActions, applyEffect: () => void 0 });
    const Outer = defineSheetCommand('sheet.lifecycle.outer');
    const Nested = defineSheetCommand('sheet.lifecycle.nested');
    const observed: boolean[] = [];
    bus.register(
      Outer,
      () =>
        new LocalActionCommand(Outer.id, () => {
          observed.push(bus.isExecuting(), isInsideCommandExecution());
        }),
    );
    bus.register(
      Nested,
      () =>
        new LocalActionCommand(Nested.id, () => {
          observed.push(bus.isExecuting(), isInsideCommandExecution());
        }),
    );
    bus.subscribe((event) => {
      if (event.id !== Outer.id || event.phase !== CommandExecutionPhase.Started) return;
      observed.push(bus.isExecuting(), isInsideCommandExecution());
      bus.run(Nested, undefined);
      observed.push(bus.isExecuting(), isInsideCommandExecution());
    });

    bus.run(Outer, undefined);
    expect(observed).toEqual([false, false, true, true, false, false, true, true]);
  });

  it('does not let a listener forge this bus write authority with the global command scope', () => {
    const bus = new SheetCommandBus();
    bus.bind({ executePipeline: executePipelineWithLocalActions, applyEffect: () => void 0 });
    const Command = defineSheetCommand('sheet.lifecycle.forgedScope');
    const observed: boolean[] = [];
    bus.register(Command, () => new LocalActionCommand(Command.id, () => void 0));
    bus.subscribe((event) => {
      if (event.phase !== CommandExecutionPhase.Completed) return;
      runInsideCommandExecution('forged', () => observed.push(bus.isExecuting()));
    });

    bus.run(Command, void 0);

    expect(observed).toEqual([false]);
  });

  it('does not inherit another editor command while dispatching a nested listener', () => {
    const outer = new SheetCommandBus();
    const inner = new SheetCommandBus();
    const context = { executePipeline: executePipelineWithLocalActions, applyEffect: () => void 0 };
    outer.bind(context);
    inner.bind(context);
    const Outer = defineSheetCommand('sheet.lifecycle.outerEditor');
    const Inner = defineSheetCommand('sheet.lifecycle.innerEditor');
    const FollowUp = defineSheetCommand('sheet.lifecycle.explicitFollowUp');
    const observed: boolean[] = [];
    outer.register(Outer, () => new LocalActionCommand(Outer.id, () => inner.run(Inner, void 0)));
    outer.register(FollowUp, () => new LocalActionCommand(FollowUp.id, () => observed.push(outer.isExecuting())));
    inner.register(Inner, () => new LocalActionCommand(Inner.id, () => void 0));
    inner.subscribe((event) => {
      if (event.phase !== CommandExecutionPhase.Completed) return;
      runInsideCommandExecution('forged', () => observed.push(outer.isExecuting()));
      outer.run(FollowUp, void 0);
      observed.push(outer.isExecuting());
    });

    outer.run(Outer, void 0);

    expect(observed).toEqual([false, true, false]);
  });

  it('isolates command lifecycle listener failures from command execution', () => {
    const platform = createWarningPlatform();
    const executePipeline = jest.fn();
    const completedListener = jest.fn();
    const bus = new SheetCommandBus(platform as never);
    bus.bind({ executePipeline, applyEffect: () => void 0 });
    bus.subscribe(() => {
      throw new Error('listener failed');
    });
    bus.subscribe((event) => {
      if (event.phase === CommandExecutionPhase.Completed) completedListener();
    });
    const Command = defineSheetCommand('feature.listenerIsolation');
    bus.register(
      Command,
      () => new TransactionPipelineCommand(Command.id, createSheetTransaction(new PluginKey('command'), [])),
    );

    expect(() => bus.run(Command, void 0)).not.toThrow();
    expect(executePipeline).toHaveBeenCalledTimes(1);
    expect(completedListener).toHaveBeenCalledTimes(1);
    expect(platform.warn).toHaveBeenCalledTimes(2);
    expect(platform.warn).toHaveBeenCalledWith(
      expect.stringContaining('SheetCommandBus listener failed during completed:feature.listenerIsolation'),
      expect.any(Error),
    );
  });

  it('routes a complete pipeline through the command context', () => {
    const executePipeline = jest.fn();
    const pipeline = new Pipeline('select-cell');
    new SheetCommandDispatcher().execute(
      { applyEffect: () => void 0, executePipeline },
      new PipelineExecutionCommand('sheet.selectCell', pipeline),
    );

    expect(executePipeline).toHaveBeenCalledWith(pipeline);
  });

  it('rejects malformed command results', () => {
    const missingPipeline = {
      id: 'missing-pipeline',
      execute: () => ({}),
    } as unknown as SheetCommand;
    expect(() =>
      new SheetCommandDispatcher().execute(
        { executePipeline: () => void 0, applyEffect: () => void 0 },
        missingPipeline,
      ),
    ).toThrow('without a pipeline');

    const malformed = {
      id: 'malformed',
      execute: () => void 0,
    } as unknown as SheetCommand;

    expect(() =>
      new SheetCommandDispatcher().execute({ executePipeline: () => void 0, applyEffect: () => void 0 }, malformed),
    ).toThrow('without a result');
  });

  it('runs registered feature commands by stable identifier', () => {
    const executePipeline = jest.fn(executePipelineWithLocalActions);
    const bus = new SheetCommandBus();
    bus.bind({ executePipeline, applyEffect: () => void 0 });
    const IncrementCommand = defineSheetCommand<number>('feature.increment');
    const DuplicateIncrementCommand = defineSheetCommand('feature.increment');
    const unregister = bus.register(
      IncrementCommand,
      (value) => new LocalActionCommand(IncrementCommand.id, () => value),
    );

    bus.run(IncrementCommand, 1);
    expect(bus.has(IncrementCommand)).toBe(true);
    expect(bus.has(IncrementCommand.id)).toBe(true);
    expect(bus.getRegisteredCommands()).toEqual([IncrementCommand]);
    expect(bus.getRegisteredCommandIds()).toEqual(['feature.increment']);
    expect(() =>
      bus.register(DuplicateIncrementCommand, () => new LocalActionCommand(DuplicateIncrementCommand.id, () => void 0)),
    ).toThrow('feature.increment');
    unregister();

    expect(() => bus.run(IncrementCommand, 1)).toThrow('feature.increment');
    expect(bus.has(IncrementCommand)).toBe(false);
    expect(bus.has(IncrementCommand.id)).toBe(false);
  });

  it('locks registered definitions and keeps stale disposers from removing replacements', () => {
    const bus = new SheetCommandBus();
    const definition = { id: 'feature.retainedDefinition' } as SheetCommandDefinition<void>;
    const disposeFirst = bus.register(definition, () => new LocalActionCommand(definition.id, () => void 0));
    expect(() => {
      (definition as { id: string }).id = 'changed';
    }).toThrow();
    disposeFirst();
    bus.register(definition, () => new LocalActionCommand(definition.id, () => void 0));
    disposeFirst();
    expect(bus.has(definition)).toBe(true);
  });

  it('does not warn when executing a registered sheet command through run', () => {
    const platform = createWarningPlatform();
    const executePipeline = jest.fn(executePipelineWithLocalActions);
    const bus = new SheetCommandBus(platform as never);
    bus.bind({ executePipeline, applyEffect: () => void 0 });
    const FormalCommand = defineSheetCommand('feature.formalRun');
    bus.register(FormalCommand, () => new LocalActionCommand(FormalCommand.id, () => void 0));

    bus.run(FormalCommand, void 0);

    expect(platform.warn).not.toHaveBeenCalled();
  });

  it('does not expose concrete sheet command execution as a public API', () => {
    const bus = new SheetCommandBus();

    expect('execute' in bus).toBe(false);
  });

  it('warns when a sheet command is invoked with a recreated definition object', () => {
    const platform = createWarningPlatform();
    const executePipeline = jest.fn(executePipelineWithLocalActions);
    const bus = new SheetCommandBus(platform as never);
    bus.bind({ executePipeline, applyEffect: () => void 0 });
    const ExportedCommand = defineSheetCommand('feature.syntheticSheetDefinition');
    const RecreatedCommand = defineSheetCommand('feature.syntheticSheetDefinition');
    bus.register(ExportedCommand, () => new LocalActionCommand(ExportedCommand.id, () => void 0));

    bus.run(RecreatedCommand, void 0);

    expect(platform.warn).toHaveBeenCalledTimes(1);
    expect(platform.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'SheetCommandBus.run("feature.syntheticSheetDefinition") received a command definition object different from the registered definition',
      ),
    );
  });

  it('rejects a factory that returns a command with a different id', () => {
    const bus = new SheetCommandBus();
    bus.bind({ executePipeline: () => void 0, applyEffect: () => void 0 });
    const ExpectedCommand = defineSheetCommand('feature.expected');
    bus.register(ExpectedCommand, () => new LocalActionCommand('feature.actual', () => void 0));

    expect(() => bus.run(ExpectedCommand, void 0)).toThrow('mismatched id feature.actual');
  });

  it('runs factories inside the command boundary and reports factory failures', () => {
    const bus = new SheetCommandBus();
    bus.bind({ executePipeline: executePipelineWithLocalActions, applyEffect: () => void 0 });
    const phases: CommandExecutionPhase[] = [];
    bus.subscribe((event) => phases.push(event.phase));
    const FactoryCommand = defineSheetCommand('feature.factoryBoundary');
    bus.register(FactoryCommand, () => {
      expect(bus.isExecuting()).toBe(true);
      throw new Error('factory failed');
    });

    expect(() => bus.run(FactoryCommand, void 0)).toThrow('factory failed');
    expect(bus.isExecuting()).toBe(false);
    expect(phases).toEqual([CommandExecutionPhase.Started, CommandExecutionPhase.Failed]);
  });

  it('does not accept a forged execution depth', () => {
    const bus = new SheetCommandBus();
    (bus as unknown as { executionDepth: number }).executionDepth = 1;
    expect(Reflect.set(bus, 'isExecuting', () => true)).toBe(false);
    const internals = bus as unknown as Record<string, unknown>;
    expect(internals['registrations']).toBeUndefined();
    expect(internals['dispatcher']).toBeUndefined();
    expect(internals['context']).toBeUndefined();
    expect(internals['executeCommand']).toBeUndefined();
    expect(bus.isExecuting()).toBe(false);
  });

  it('keeps the first Sheet runtime binding', () => {
    const bus = new SheetCommandBus();
    const context = { executePipeline: jest.fn(), applyEffect: jest.fn() };
    bus.bind(context);
    expect(() => bus.bind(context)).toThrow('already bound');
  });

  it('reports failed commands and rejects execution before binding', () => {
    const bus = new SheetCommandBus();
    const FailingCommand = defineSheetCommand('feature.fail');
    bus.register(
      FailingCommand,
      () =>
        new LocalActionCommand(FailingCommand.id, () => {
          throw new Error('failure');
        }),
    );
    expect(() => bus.run(FailingCommand, void 0)).toThrow('before it is bound');

    const events: string[] = [];
    bus.bind({ executePipeline: executePipelineWithLocalActions, applyEffect: () => void 0 });
    bus.subscribe((event) => events.push(event.phase));
    expect(() => bus.run(FailingCommand, void 0)).toThrow('failure');

    expect(events).toEqual([CommandExecutionPhase.Started, CommandExecutionPhase.Failed]);
  });

  it('releases listeners, command factories, and the editor binding on destroy', () => {
    const bus = new SheetCommandBus();
    const listener = jest.fn();
    bus.bind({ executePipeline: () => void 0, applyEffect: () => void 0 });
    const unsubscribe = bus.subscribe(listener);
    const NoopCommand = defineSheetCommand('feature.noop');
    bus.register(NoopCommand, () => new LocalActionCommand(NoopCommand.id, () => void 0));
    unsubscribe();
    bus.destroy();

    expect(() => bus.run(NoopCommand, void 0)).toThrow('SheetCommandBus has been destroyed.');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('doc commands', () => {
  function createDocCommand(id: string): { id: string; execute(): DocCommandResult } {
    return {
      id,
      execute(): DocCommandResult {
        return { pipeline: new Pipeline(id) };
      },
    };
  }

  it('runs document lifecycle observers without mutation authority', () => {
    const bus = new DocCommandBus();
    bus.bind({ executePipeline: () => void 0, applyEffect: () => void 0 });
    const observed: Array<[CommandExecutionPhase, boolean]> = [];
    bus.subscribe((event) => observed.push([event.phase, bus.isExecuting()]));
    const Success = defineDocCommand('doc.lifecycle.success');
    const Failure = defineDocCommand('doc.lifecycle.failure');
    bus.register(Success, () => createDocCommand(Success.id));
    bus.register(Failure, () => {
      throw new Error('failed');
    });

    bus.run(Success, void 0);
    expect(() => bus.run(Failure, void 0)).toThrow('failed');
    expect(observed).toEqual([
      [CommandExecutionPhase.Started, false],
      [CommandExecutionPhase.Completed, false],
      [CommandExecutionPhase.Started, false],
      [CommandExecutionPhase.Failed, false],
    ]);
    expect(bus.isExecuting()).toBe(false);
  });

  it('does not let a document listener forge this bus write authority', () => {
    const bus = new DocCommandBus();
    bus.bind({ executePipeline: () => void 0, applyEffect: () => void 0 });
    const Command = defineDocCommand('doc.lifecycle.forgedScope');
    const observed: boolean[] = [];
    bus.register(Command, () => createDocCommand(Command.id));
    bus.subscribe((event) => {
      if (event.phase !== CommandExecutionPhase.Completed) return;
      runInsideCommandExecution('forged', () => observed.push(bus.isExecuting()));
    });

    bus.run(Command, void 0);

    expect(observed).toEqual([false]);
  });

  it('runs the factory within dispatch and isolates lifecycle listener failures', () => {
    const platform = createWarningPlatform();
    const executePipeline = jest.fn();
    const bus = new DocCommandBus(platform as never);
    bus.bind({ executePipeline, applyEffect: () => void 0 });
    const observed: CommandExecutionPhase[] = [];
    bus.subscribe(() => {
      throw new Error('listener failed');
    });
    bus.subscribe((event) => observed.push(event.phase));
    const Command = defineDocCommand('doc.feature.listenerIsolation');
    const factory = jest.fn(() => {
      expect(bus.isExecuting()).toBe(true);
      return createDocCommand(Command.id);
    });
    bus.register(Command, factory);

    expect(() => bus.run(Command, void 0)).not.toThrow();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(executePipeline).toHaveBeenCalledTimes(1);
    expect(bus.isExecuting()).toBe(false);
    expect(observed).toEqual([CommandExecutionPhase.Started, CommandExecutionPhase.Completed]);
    expect(platform.warn).toHaveBeenCalledTimes(2);
  });

  it('reports factory failures without leaving dispatch active', () => {
    const bus = new DocCommandBus();
    bus.bind({ executePipeline: jest.fn(), applyEffect: () => void 0 });
    const Command = defineDocCommand('doc.feature.factoryFailure');
    const events: CommandExecutionPhase[] = [];
    bus.subscribe((event) => events.push(event.phase));
    bus.register(Command, () => {
      throw new Error('factory failed');
    });

    expect(() => bus.run(Command, void 0)).toThrow('factory failed');
    expect(bus.isExecuting()).toBe(false);
    expect(events).toEqual([CommandExecutionPhase.Started, CommandExecutionPhase.Failed]);
  });

  it('rejects a factory result with the wrong id and still notifies later listeners', () => {
    const platform = createWarningPlatform();
    const executePipeline = jest.fn();
    const bus = new DocCommandBus(platform as never);
    bus.bind({ executePipeline, applyEffect: () => void 0 });
    const Command = defineDocCommand('doc.feature.expectedId');
    const events: CommandExecutionPhase[] = [];
    bus.subscribe(() => {
      throw new Error('observer failed');
    });
    bus.subscribe((event) => events.push(event.phase));
    bus.register(Command, () => createDocCommand('doc.feature.wrongId'));

    expect(() => bus.run(Command, void 0)).toThrow('mismatched id');
    expect(executePipeline).not.toHaveBeenCalled();
    expect(bus.isExecuting()).toBe(false);
    expect(events).toEqual([CommandExecutionPhase.Started, CommandExecutionPhase.Failed]);
    expect(platform.warn).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate registrations and an unbound command bus', () => {
    const bus = new DocCommandBus();
    const Command = defineDocCommand('doc.feature.registration');
    const factory = () => createDocCommand(Command.id);
    bus.register(Command, factory);

    expect(() => bus.register(Command, factory)).toThrow('already has a command registered');
    expect(() => bus.run(Command, void 0)).toThrow('before it is bound');
    bus.destroy();
    expect(() => bus.run(Command, void 0)).toThrow('has been destroyed');
  });

  it('locks retained document command definitions', () => {
    const bus = new DocCommandBus();
    const definition = { id: 'doc.feature.retainedDefinition' } as DocCommandDefinition<void>;
    bus.register(definition, () => createDocCommand(definition.id));
    expect(() => {
      (definition as { id: string }).id = 'changed';
    }).toThrow();
  });

  it('does not accept a forged execution depth', () => {
    const bus = new DocCommandBus();
    (bus as unknown as { executionDepth: number }).executionDepth = 1;
    expect(Reflect.set(bus, 'isExecuting', () => true)).toBe(false);
    const internals = bus as unknown as Record<string, unknown>;
    expect(internals['registrations']).toBeUndefined();
    expect(internals['dispatcher']).toBeUndefined();
    expect(internals['context']).toBeUndefined();
    expect(internals['executeCommand']).toBeUndefined();
    expect(bus.isExecuting()).toBe(false);
  });

  it('does not warn when executing a registered doc command through run', () => {
    const platform = createWarningPlatform();
    const executePipeline = jest.fn();
    const bus = new DocCommandBus(platform as never);
    bus.bind({ executePipeline, applyEffect: () => void 0 });
    const FormalCommand = defineDocCommand('doc.feature.formalRun');
    bus.register(FormalCommand, () => createDocCommand(FormalCommand.id));

    bus.run(FormalCommand, void 0);

    expect(platform.warn).not.toHaveBeenCalled();
  });

  it('does not expose concrete doc command execution as a public API', () => {
    const bus = new DocCommandBus();

    expect('execute' in bus).toBe(false);
  });

  it('warns when a doc command is invoked with a recreated definition object', () => {
    const platform = createWarningPlatform();
    const executePipeline = jest.fn();
    const bus = new DocCommandBus(platform as never);
    bus.bind({ executePipeline, applyEffect: () => void 0 });
    const ExportedCommand = defineDocCommand('doc.feature.syntheticDefinition');
    const RecreatedCommand = defineDocCommand('doc.feature.syntheticDefinition');
    bus.register(ExportedCommand, () => createDocCommand(ExportedCommand.id));

    bus.run(RecreatedCommand, void 0);

    expect(platform.warn).toHaveBeenCalledTimes(1);
    expect(platform.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'DocCommandBus.run("doc.feature.syntheticDefinition") received a command definition object different from the registered definition',
      ),
    );
  });
});
