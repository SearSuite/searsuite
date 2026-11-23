import * as moduleExports from '../src/index';

describe('@searsuite/sear-assembly-setup public API', () => {
  it('exports DI registration, plugin base types, and editor factory', () => {
    expect(moduleExports.registerDefaultDependencies).toBeDefined();
    expect(moduleExports.SheetPlugin).toBeDefined();
    expect(moduleExports.registerSheetPluginCommands).toBeDefined();
    expect(moduleExports.registerSheetPluginObservations).toBeDefined();
    expect(moduleExports.registerSheetPluginSessionStates).toBeDefined();
    expect(moduleExports.SessionStateRegistry).toBeDefined();
    expect(moduleExports.SessionStateRestorePhase).toBeDefined();
    expect(moduleExports.defineSessionState).toBeDefined();
    expect(moduleExports.readSessionState).toBeDefined();
    expect(moduleExports.defineSheetRuntimeCapability).toBeDefined();
    expect(moduleExports.SheetRuntimeCapability).toBeDefined();
    expect(moduleExports.SheetRuntimeExtensionRegistry).toBeDefined();
    expect(moduleExports.DocPlugin).toBeDefined();
    expect(moduleExports.registerDocPluginCommands).toBeDefined();
    expect(moduleExports.registerDocPluginObservations).toBeDefined();
    expect(moduleExports.registerDocPluginSessionStates).toBeDefined();
    expect(moduleExports.CaptureDocSessionStateCommand).toBeDefined();
    expect(moduleExports.ExportDocStateCommand).toBeDefined();
    expect(moduleExports.DocDocumentObservation).toBeDefined();
    expect(moduleExports.DocInlineStyleObservation).toBeDefined();
    expect(moduleExports.DocSelectionObservation).toBeDefined();
    expect(moduleExports.DocViewportObservation).toBeDefined();
    expect(moduleExports.DocHistoryStatusObservation).toBeDefined();
    expect(moduleExports.DocSelectionSessionStateDefinition).toBeDefined();
    expect(moduleExports.DocViewportSessionStateDefinition).toBeDefined();
    expect(moduleExports.DocHistorySessionStateDefinition).toBeDefined();
    expect(moduleExports.RichTextBlockNode).toBeDefined();
    expect(moduleExports.ViewportOverlayNode).toBeDefined();
    expect(moduleExports.createSheetEditor).toBeDefined();
    expect(moduleExports.createDocEditor).toBeDefined();
    expect(moduleExports.ApplyViewportScrollCommand).toBeDefined();
    expect(moduleExports.ScrollViewportToCommand).toBeDefined();
    expect(moduleExports.registerSheetViewportCommands).toBeDefined();
  });

  it('manages typed runtime extension capabilities', () => {
    const registry = new moduleExports.SheetRuntimeExtensionRegistry();
    const capability = moduleExports.defineSheetRuntimeCapability<{ readonly value: number }>('test.runtime.value');
    const missingCapability = moduleExports.defineSheetRuntimeCapability('test.runtime.missing');

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
