import {
  DocCompositionManager,
  DocCursorManager,
  DocInputPlugin,
  Pipeline,
  SearCoreDoc,
  SearCoreSheet,
} from '@searsuite/sear-assembly-core';
import { Container } from '@searsuite/sear-foundation-di';
import type { KeyboardRouterHandlers, TextInputEvent } from '@searsuite/sear-render-input';
import { SheetCellEditorPlugin as RuntimeSheetCellEditorPlugin } from '../src/SheetCellEditor';
import { BeginCellEditCommand, OpenCellEditorCommand, RequestCellEditorRenderCommand } from '../src';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { RichTextBlockFlowRegistry } from '@searsuite/sear-domain-doc';
import { FakeSheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';

let container: Container;

function createCompositionManager(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    clear: jest.fn(),
    setText: jest.fn(),
    measure: jest.fn(() => ({ active: false, text: '', textWidth: 0, caretPixelOffset: 0 })),
    getText: jest.fn(() => ''),
    getCaretPixelOffset: jest.fn(() => 0),
    ...overrides,
  };
}

function createDocInputPlugin(): DocInputPlugin {
  return new DocInputPlugin(new DocLayoutEngine(new RichTextBlockFlowRegistry()));
}

function createEmbeddedEditor(): FakeSheetEmbeddedEditor {
  return new FakeSheetEmbeddedEditor();
}

class SheetCellEditorPlugin extends RuntimeSheetCellEditorPlugin {
  constructor(...args: ConstructorParameters<typeof RuntimeSheetCellEditorPlugin>) {
    super(...args);
    this.bindRuntimeServices(container);
  }
}

describe('SheetCellEditorPlugin construction', () => {
  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    container.reset();
  });

  it('registers its document input plugin, cursor predicate, interaction reducers, and text-input bridge', () => {
    const embeddedEditor = createEmbeddedEditor();
    let textInputHandlers:
      | {
          onTextInput(event: TextInputEvent): void;
          onDelete(): void;
        }
      | undefined;
    const textInput = {
      subscribe: jest.fn(
        (handlers: { onTextInput(event: TextInputEvent): void; onDelete(): void }) => (textInputHandlers = handlers),
      ),
    };
    const cursorRule = jest.fn();
    const cursorRegistry = { register: cursorRule };
    const reducerRegistry = { get: jest.fn(() => void 0), register: jest.fn() };
    let blinkTick: (() => void) | undefined;
    const platform = {
      setInterval: jest.fn((callback: () => void) => {
        blinkTick = callback;
        return 1;
      }),
      clearInterval: jest.fn(),
      warn: jest.fn(),
    };

    const dispatch = jest.fn();
    const requestRender = jest.fn();
    container.registerInstance(SearCoreSheet.symbol, { dispatch, requestRender } as never);

    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn() } as never,
      { navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      textInput as never,
      { subscribe: jest.fn(), startListener: jest.fn() } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      cursorRegistry as never,
      { override: jest.fn() } as never,
      platform as never,
      { commit: jest.fn() } as never,
      { clear: jest.fn(), highlight: jest.fn() } as never,
      { viewToWorld: jest.fn() } as never,
      reducerRegistry as never,
      embeddedEditor,
    );

    expect(plugin.getState()).toHaveLength(3);
    expect(cursorRule).toHaveBeenCalledWith(expect.objectContaining({ kind: 'predicate', cursor: 'text' }));
    expect(cursorRule.mock.calls[0][0].test({ isEdit: true })).toBe(true);
    expect(cursorRule.mock.calls[0][0].test({ isEdit: false })).toBe(false);
    expect(reducerRegistry.register).toHaveBeenCalledTimes(2);
    expect(textInput.subscribe).toHaveBeenCalledTimes(1);

    textInputHandlers?.onDelete();
    expect(platform.warn).toHaveBeenCalledWith(
      'SheetCellEditorPlugin getCommandBus skipped: SheetCommandBus is missing.',
    );

    const fallbackBus = (
      plugin as unknown as {
        getCommandBus(core?: SearCoreSheet): SheetCommandBus | null;
      }
    ).getCommandBus();
    expect(fallbackBus).toBeNull();
    expect(platform.warn).toHaveBeenCalledWith(
      'SheetCellEditorPlugin getCommandBus skipped: SheetCommandBus is missing.',
    );
    const injectedCommands = new SheetCommandBus();
    injectedCommands.bind({
      executePipeline: (pipeline) => {
        pipeline.steps.forEach((step) => {
          if (step.transaction) dispatch(step.transaction);
          step.localAction?.();
        });
      },
      applyEffect: () => void 0,
    });
    const commandPlugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn() } as never,
      { navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      textInput as never,
      { subscribe: jest.fn(), startListener: jest.fn() } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      cursorRegistry as never,
      { override: jest.fn() } as never,
      platform as never,
      { commit: jest.fn() } as never,
      { clear: jest.fn(), highlight: jest.fn() } as never,
      { viewToWorld: jest.fn() } as never,
      reducerRegistry as never,
      embeddedEditor,
      injectedCommands,
    );
    const commandInternals = commandPlugin as unknown as {
      isEditing: boolean;
      getCommandBus(): SheetCommandBus | null;
      registerCommands(commands: SheetCommandBus): void;
    };
    commandInternals.registerCommands(injectedCommands);

    textInputHandlers?.onDelete();
    expect(() => textInputHandlers?.onTextInput({ kind: 'text', text: 'abc' })).not.toThrow();

    commandInternals.isEditing = true;

    textInputHandlers?.onTextInput({ kind: 'compositionUpdate', text: '\u62fc', caretOffset: 1 });
    expect(embeddedEditor.inputs).toHaveLength(0);

    (commandPlugin as unknown as { blinker: { start(): void } }).blinker.start();
    blinkTick?.();
    expect(platform.setInterval).toHaveBeenCalled();

    (commandPlugin as unknown as { executeEditorInput(input: { kind: 'delete' }): void }).executeEditorInput({
      kind: 'delete',
    });
    (commandPlugin as unknown as { executeEditorInput(input: { kind: 'selectAll' }): void }).executeEditorInput({
      kind: 'selectAll',
    });

    expect(commandInternals.getCommandBus()).toBe(injectedCommands);

    commandInternals.isEditing = false;
    const renderCalls = requestRender.mock.calls.length;
    injectedCommands.run(RequestCellEditorRenderCommand, void 0);
    expect(requestRender).toHaveBeenCalledTimes(renderCalls);
  });

  it('routes edit-session keyboard commands to the document input plugin', () => {
    container.registerInstance(SearCoreDoc.symbol, { registerPlugin: jest.fn() } as never);
    container.registerInstance(DocCompositionManager.symbol, createCompositionManager() as never);
    let handlers: KeyboardRouterHandlers | undefined;
    const commands = new SheetCommandBus();
    commands.bind({
      executePipeline: (pipeline) => {
        pipeline.steps.forEach((step) => step.prepare?.());
        pipeline.steps.forEach((step) => step.localAction?.());
        pipeline.steps.forEach((step) => step.postCommit?.());
      },
      applyEffect: () => void 0,
    });
    const embeddedEditor = createEmbeddedEditor();
    const createSession = embeddedEditor.createEditSession.bind(embeddedEditor);
    let handleInput: jest.SpyInstance | undefined;
    jest.spyOn(embeddedEditor, 'createEditSession').mockImplementation((context) => {
      const session = createSession(context);
      handleInput = jest.spyOn(session, 'handleInput');
      return session;
    });
    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn() } as never,
      { navigateDown: jest.fn(), restartNavigation: jest.fn(), getState: () => [{ getPoint: () => [-1, -1] }] } as never,
      { subscribe: jest.fn(), startListener: jest.fn() } as never,
      {
        subscribe: jest.fn((next: KeyboardRouterHandlers) => (handlers = next)),
        startListener: jest.fn(),
      } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      { register: jest.fn() } as never,
      { override: jest.fn() } as never,
      { setInterval: jest.fn(() => 1), clearInterval: jest.fn() } as never,
      { commit: jest.fn() } as never,
      { clear: jest.fn(), highlight: jest.fn() } as never,
      { viewToWorld: jest.fn() } as never,
      { get: jest.fn(() => void 0), register: jest.fn() } as never,
      embeddedEditor,
      commands,
    ) as unknown as {
      registerCommands(commands: SheetCommandBus): void;
      bindCore(core: SearCoreSheet): void;
    };
    plugin.registerCommands(commands);
    const core = {
      getDataEngine: () => ({ getDataType: () => void 0, readDataViewField: () => null }),
      configEngine: { getDefaultConfig: () => ({}) },
      renderEngine: { renderContext: {}, markDirty: jest.fn() },
      requestRender: jest.fn(),
    };
    plugin.bindCore(core as never);
    commands.run(OpenCellEditorCommand, { row: 0, column: 0 });

    handlers?.onDelete?.();
    handlers?.onArrowLeft?.(true, false);
    handlers?.onArrowRight?.(false, false);
    handlers?.onArrowUp?.(true, false);
    handlers?.onArrowDown?.(false, false);
    handlers?.onSelectAll?.();
    handlers?.onSoftEnter?.();

    expect(handleInput).toHaveBeenCalled();
  });

  it('skips command-backed editor helpers when the command bus is missing', () => {
    container.registerInstance(SearCoreDoc.symbol, { registerPlugin: jest.fn() } as never);
    container.registerInstance(DocCompositionManager.symbol, createCompositionManager() as never);
    const platform = { setInterval: jest.fn(), clearInterval: jest.fn(), warn: jest.fn() };
    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn() } as never,
      { navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      { subscribe: jest.fn() } as never,
      { subscribe: jest.fn(), startListener: jest.fn() } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      { register: jest.fn() } as never,
      { override: jest.fn() } as never,
      platform as never,
      { commit: jest.fn() } as never,
      { clear: jest.fn(), highlight: jest.fn() } as never,
      { viewToWorld: jest.fn() } as never,
      { get: jest.fn(() => void 0), register: jest.fn() } as never,
      createEmbeddedEditor(),
    ) as unknown as {
      isEditing: boolean;
      runCellEditorCommand<Input>(core: SearCoreSheet, definition: typeof BeginCellEditCommand, input: Input): void;
      requestRerender(): void;
    };
    container.registerInstance(SearCoreSheet.symbol, {} as never);

    plugin.runCellEditorCommand({} as never, BeginCellEditCommand, {
      anchor: [0, 0],
      focus: [0, 0],
      editor: 'cell',
    });
    plugin.isEditing = true;
    plugin.requestRerender();

    expect(platform.warn).toHaveBeenCalledWith(
      'SheetCellEditorPlugin getCommandBus skipped: SheetCommandBus is missing.',
    );

    const pluginWithoutPlatform = new SheetCellEditorPlugin(
      {} as never,
      {} as never,
      { subscribe: jest.fn() } as never,
      { subscribe: jest.fn() } as never,
      {} as never,
      { register: jest.fn() } as never,
      {} as never,
      undefined as never,
      {} as never,
      {} as never,
      {} as never,
      { register: jest.fn(), get: jest.fn() } as never,
    ) as unknown as {
      executeEditorInput(input: { kind: 'delete' }): void;
    };
    expect(() => pluginWithoutPlatform.executeEditorInput({ kind: 'delete' })).not.toThrow();
  });
});
