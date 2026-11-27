import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { ViewExtensionBase, ViewExtensionRole, type ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';
import { type CellProperties } from '@searsuite/sear-render-registry';

/** Pins presentation contracts independently of business state ownership. */
export function sealSheetViewWrites(
  views: ViewExtensionRegistry<SearCoreSheet, CellProperties>,
  assertWrite: () => void,
): void {
  views.forEach((view) => {
    if (view instanceof ViewExtensionBase)
      ViewExtensionBase.prototype.enforceRuntimeWriteBoundary.call(view, assertWrite);
    for (const name of ['key', 'depth', 'warnOnDuplicateDepth', ViewExtensionRole]) {
      Object.defineProperty(view, name, { value: Reflect.get(view, name), writable: false, configurable: false });
    }
    for (const name of [
      'render',
      'onCommit',
      'dirtyRect',
      'initializeView',
      'onClick',
      'onDblClick',
      'onMouseDown',
      'onMouseMove',
      'onMouseUp',
    ]) {
      Object.defineProperty(view, name, { value: Reflect.get(view, name), writable: false, configurable: false });
    }
    const destroy = view.destroyView;
    if (destroy)
      Object.defineProperty(view, 'destroyView', {
        value: () => {
          assertWrite();
          destroy.call(view);
        },
        writable: false,
        configurable: false,
      });
  });
}
