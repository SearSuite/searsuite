import {
  registerDocPluginKeyboardHandlers,
  registerDocPluginInlineStyles,
  type DocKeyboardHandlerRegistrationContext,
  type DocPlugin,
} from '../src';
import { type KeyboardRouterHandlers } from '@searsuite/sear-render-input';
import { RichTextInlineStyleRegistry } from '@searsuite/sear-domain-doc';

function createBindings() {
  const handlers = new Set<KeyboardRouterHandlers>();
  return {
    handlers,
    registerTextHandlers: jest.fn(() => () => undefined),
    registerKeyboardHandlers: jest.fn((value: KeyboardRouterHandlers) => {
      handlers.add(value);
      return () => handlers.delete(value);
    }),
  };
}

describe('Doc plugin keyboard handler registration', () => {
  it('routes a binding through the command bus and disposes it', () => {
    const bindings = createBindings();
    const run = jest.fn();
    const plugin: Pick<DocPlugin<null>, 'registerKeyboardHandlers'> = {
      registerKeyboardHandlers({ bindings: inputBindings, commands }: DocKeyboardHandlerRegistrationContext) {
        inputBindings.registerKeyboardHandlers({
          onToggleBold: () => void (commands.run as unknown as jest.Mock)({ id: 'toggle' }, void 0),
        });
      },
    };

    const dispose = registerDocPluginKeyboardHandlers([plugin], {
      bindings,
      commands: { run } as never,
    });

    expect(bindings.handlers.size).toBe(1);
    [...bindings.handlers][0]?.['onToggleBold']?.();
    expect(run).toHaveBeenCalledWith({ id: 'toggle' }, void 0);
    dispose();
    expect(bindings.handlers.size).toBe(0);
  });

  it('rolls back previously registered handlers when a later plugin fails', () => {
    const bindings = createBindings();
    const first = {
      registerKeyboardHandlers({ bindings: inputBindings }: DocKeyboardHandlerRegistrationContext) {
        inputBindings.registerKeyboardHandlers({ onUndo: () => undefined });
      },
    };
    const second = {
      registerKeyboardHandlers({ bindings: inputBindings }: DocKeyboardHandlerRegistrationContext) {
        inputBindings.registerKeyboardHandlers({ onRedo: () => undefined });
        throw new Error('keyboard registration failed');
      },
    };

    expect(() =>
      registerDocPluginKeyboardHandlers([first, second], {
        bindings,
        commands: { run: jest.fn() } as never,
      }),
    ).toThrow('keyboard registration failed');
    expect(bindings.handlers.size).toBe(0);
  });
});

describe('Doc plugin inline style registration', () => {
  it('lets a plugin query the registry during registration and disposes its contribution', () => {
    const registry = new RichTextInlineStyleRegistry();
    const plugin = {
      registerInlineStyles(registrar: RichTextInlineStyleRegistry) {
        registrar.register({
          key: 'test.style',
          mutations: [{ styleKey: 'testStyle', apply: ({ attrs }) => attrs }],
        });
        expect(registrar.getMutationKeys()).toEqual(['testStyle']);
      },
    };

    const dispose = registerDocPluginInlineStyles([plugin], registry);
    expect(registry.getMutationKeys()).toEqual(['testStyle']);
    dispose();
    expect(registry.getMutationKeys()).toEqual([]);
  });
});
