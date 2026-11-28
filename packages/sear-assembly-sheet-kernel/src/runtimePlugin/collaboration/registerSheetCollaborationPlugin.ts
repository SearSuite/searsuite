import { type PluginManager } from '@searsuite/sear-assembly-plugin';
import { type Container, Scope } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import {
  CollabTransport,
  CollaborationChannel,
  CollaborationChannelBinding,
  SheetCollaborationPlugin,
} from '@searsuite/sear-plugin-collab';
import { SheetOwnerLifecycle } from '../../SheetOwnerLifecycle';

import { type SheetRuntimeAdapters } from '../../SheetKernelContracts';

/** Registers sheet collaboration transport, channel binding, plugin, and lifecycle ownership. */
export function registerSheetCollaborationPlugin(
  container: Container,
  manager: PluginManager,
  adapters: SheetRuntimeAdapters,
): void {
  if (!adapters.collabTransport && !container.hasBinding(CollaborationChannelBinding.symbol)) return;
  if (adapters.collabTransport) container.register(CollabTransport.symbol, adapters.collabTransport, Scope.Singleton);
  if (!container.hasBinding(CollaborationChannelBinding.symbol)) {
    container.registerInstance(CollaborationChannelBinding.symbol, {
      channel: new CollaborationChannel(
        container.resolve<CollabTransport>(CollabTransport.symbol),
        container.resolve<Platform>(Platform.symbol),
      ),
      owner: 'editor',
    });
  }
  container.register(SheetCollaborationPlugin.symbol, SheetCollaborationPlugin, Scope.Singleton);
  const collaboration = container.resolve<SheetCollaborationPlugin>(SheetCollaborationPlugin.symbol);
  manager.registerPlugin(collaboration);
  container.resolve<SheetOwnerLifecycle>(SheetOwnerLifecycle.symbol).register(collaboration);
}
