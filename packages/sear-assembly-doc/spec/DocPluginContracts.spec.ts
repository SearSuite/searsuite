import { registerDocPluginInlineStyles } from '../src';
import { RichTextInlineStyleRegistry } from '@searsuite/sear-domain-doc';
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
