import * as docApi from '@searsuite/sear-assembly-doc';
import * as ownerApi0 from '@searsuite/sear-assembly-commands';
import * as moduleExports from '../src/index';

describe('@searsuite/sear-assembly-setup public API', () => {
  it('exports DI registration, plugin base types, and editor factory', () => {
    expect('DocPlugin' in moduleExports).toBe(false);
    expect('SheetEditorPlugin' in moduleExports).toBe(false);
    expect(moduleExports.registerDefaultDependencies).toBeDefined();
    expect(ownerApi0.SheetPlugin).toBeDefined();
    expect(ownerApi0.registerSheetPluginCommands).toBeDefined();
    expect(ownerApi0.registerSheetPluginObservations).toBeDefined();
    expect(ownerApi0.registerSheetPluginSessionStates).toBeDefined();
    expect(moduleExports.SessionStateRegistry).toBeDefined();
    expect(moduleExports.SessionStateRestorePhase).toBeDefined();
    expect(moduleExports.defineSessionState).toBeDefined();
    expect(moduleExports.readSessionState).toBeDefined();
    expect(ownerApi0.defineSheetRuntimeCapability).toBeDefined();
    expect(ownerApi0.SheetRuntimeCapability).toBeDefined();
    expect(ownerApi0.SheetRuntimeExtensionRegistry).toBeDefined();
    expect(docApi.DocPlugin).toBeDefined();
    expect(docApi.registerDocPluginCommands).toBeDefined();
    expect(docApi.registerDocPluginObservations).toBeDefined();
    expect(docApi.registerDocPluginSessionStates).toBeDefined();
    expect(moduleExports.CaptureDocSessionStateCommand).toBeDefined();
    expect(moduleExports.ExportDocStateCommand).toBeDefined();
    expect(moduleExports.DocDocumentObservation).toBeDefined();
    expect(moduleExports.DocInlineStyleObservation).toBeDefined();
    expect(docApi.DocSelectionObservation).toBeDefined();
    expect(moduleExports.DocViewportObservation).toBeDefined();
    expect(docApi.DocHistoryStatusObservation).toBeDefined();
    expect(docApi.DocSelectionSessionStateDefinition).toBeDefined();
    expect(moduleExports.DocViewportSessionStateDefinition).toBeDefined();
    expect(docApi.DocHistorySessionStateDefinition).toBeDefined();
    expect(moduleExports.RichTextBlockNode).toBeDefined();
    expect(moduleExports.ViewportOverlayNode).toBeDefined();
    expect(moduleExports.createSheetEditor).toBeDefined();
    expect(moduleExports.createDocEditor).toBeDefined();
    expect(moduleExports.ApplyViewportScrollCommand).toBeDefined();
    expect(moduleExports.ScrollViewportToCommand).toBeDefined();
    expect(moduleExports.registerSheetViewportCommands).toBeDefined();
  });

  it('manages typed runtime extension capabilities', () => {
    const registry = new ownerApi0.SheetRuntimeExtensionRegistry();
    const capability = ownerApi0.defineSheetRuntimeCapability<{ readonly value: number }>('test.runtime.value');
    const missingCapability = ownerApi0.defineSheetRuntimeCapability('test.runtime.missing');

    expect(registry.has(capability)).toBe(false);
    expect(registry.get(capability)).toBeUndefined();
    expect(() => registry.require(missingCapability)).toThrow(
      'Runtime capability "test.runtime.missing" is not registered for SheetEditor.',
    );

    const unregister = registry.register(capability, { value: 1 });

    expect(registry.has(capability)).toBe(true);
    expect(registry.get(capability)?.value).toBe(1);
    expect(registry.require(capability).value).toBe(1);
    expect(registry.getRegisteredCapabilityIds()).toEqual(['test.runtime.value']);
    expect(() => registry.register(capability, { value: 2 })).toThrow(
      'Runtime capability "test.runtime.value" is already registered for SheetEditor.',
    );

    unregister();
    expect(registry.has(capability)).toBe(false);

    registry.register(capability, { value: 3 });
    registry.destroy();
    expect(() => registry.getRegisteredCapabilityIds()).toThrow(
      'Runtime capability registry for SheetEditor has been destroyed.',
    );
  });
});
