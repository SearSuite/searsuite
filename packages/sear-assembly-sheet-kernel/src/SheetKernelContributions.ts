import { type Container } from '@searsuite/sear-foundation-di';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import {
  SheetCellStyleRegistry,
  SheetCellInputValidationRegistry,
  SheetDisplayedValueChanges,
} from '@searsuite/sear-domain-cell-types';
import {
  SheetFormatTransferRegistry,
  SheetClipboardTransferRegistry,
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  SheetStructureMoveRegistry,
  SheetInteractionStore,
} from '@searsuite/sear-assembly-plugin';
import {
  SheetCommandBus,
  SheetCommandEffectRegistry,
  SheetRuntimeCapability,
  ReadSheetCellStyleQuery,
  registerSheetPluginCellStyles,
  registerSheetPluginCommands,
  registerSheetPluginQueries,
  registerSheetPluginObservations,
  registerSheetPluginSessionStates,
  registerSheetPluginCapabilities,
  type SheetPluginSetupRuntime,
} from '@searsuite/sear-assembly-commands';
import { registerSheetFormatTransfers } from './runtimePlugin/formatPainter/registerSheetFormatPainterPlugin';
import { registerSheetClipboardTransfers } from './registerSheetClipboardTransfers';
import { registerSheetRangeMoves } from './registerSheetRangeMoves';
import { registerSheetRangeReorders } from './registerSheetRangeReorders';
import { registerSheetStructureMoves } from './registerSheetStructureMoves';
import { registerDefaultSheetStructureCommands } from './SheetStructureCommands';
import { registerDefaultSheetRangeCommands } from './SheetRangeCommands';
import { registerSheetConfigCommands } from './SheetConfigCommands';
import { registerSheetInputValidationCommands } from './SheetInputValidationCommands';
import { registerSheetDisplayedValueCommands } from '@searsuite/sear-assembly-commands';
import { registerSheetStateSnapshotCommands } from './SheetStateSnapshotCommands';
import { registerSheetSessionStateCommands } from './SheetSessionStateCommands';
import { type SheetKernelConfiguration } from './SheetKernelContracts';
import { SheetKernel } from './SheetKernel';
import { SheetCommitObservation } from './SheetCommitObservation';
import { DefaultSheetClipboardDataSource } from './DefaultSheetClipboardDataSource';
import { SheetClipboardDataSourceSymbol } from '@searsuite/sear-plugin-clipboard';
import { SheetClipboardWorkbookBridgeSymbol, type SheetClipboardWorkbookBridge } from './SheetClipboardWorkbookBridge';

/** Registers business contributions and default state commands through one shared assembly path. */
export function registerSheetKernelContributions(
  container: Container,
  runtime: SheetPluginSetupRuntime,
  options: Pick<SheetKernelConfiguration, 'sessionState'>,
): void {
  const plugins = runtime.plugins.getAllPlugins(),
    commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol);
  const styles = container.resolve<SheetCellStyleRegistry>(SheetCellStyleRegistry.symbol),
    config = container.resolve<ConfigEngine>(ConfigEngine.symbol);
  registerSheetPluginCellStyles(plugins, styles, {
    read: () => ({
      horizontalAlign: config.getDefaultConfig().defaultCellAlign,
      verticalAlign: config.getDefaultConfig().defaultCellVerticalAlign,
    }),
  });
  runtime.queries.register(ReadSheetCellStyleQuery, ([row, column]) => styles.read(row, column));
  runtime.session.loadSnapshot(options.sessionState ?? {});
  registerSheetFormatTransfers(
    plugins,
    container.resolve<SheetFormatTransferRegistry>(SheetFormatTransferRegistry.symbol),
  );
  registerSheetClipboardTransfers(
    plugins,
    container.resolve<SheetClipboardTransferRegistry>(SheetClipboardTransferRegistry.symbol),
  );
  const ranges = container.resolve<SheetRangeMoveRegistry>(SheetRangeMoveRegistry.symbol),
    reorders = container.resolve<SheetRangeReorderRegistry>(SheetRangeReorderRegistry.symbol),
    structure = container.resolve<SheetStructureMoveRegistry>(SheetStructureMoveRegistry.symbol);
  registerSheetRangeMoves(plugins, ranges);
  registerSheetRangeReorders(plugins, reorders);
  registerSheetStructureMoves(plugins, structure);
  registerSheetPluginCommands(plugins, commands);
  registerSheetPluginQueries(plugins, runtime.queries);
  registerSheetPluginObservations(plugins, runtime.observations);
  registerSheetPluginSessionStates(plugins, runtime.session);
  registerSheetPluginCapabilities(plugins, runtime.extensions);
  const validation = container.resolve<SheetCellInputValidationRegistry>(SheetCellInputValidationRegistry.symbol);
  registerDefaultSheetStructureCommands(commands, runtime.data, structure);
  registerDefaultSheetRangeCommands(commands, runtime.data, validation);
  registerSheetConfigCommands(commands, config);
  registerSheetInputValidationCommands(commands, validation);
  registerSheetDisplayedValueCommands(
    commands,
    container.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol),
  );
  registerSheetStateSnapshotCommands(commands, runtime.plugins);
  registerSheetSessionStateCommands(commands, runtime.session);
}

/** Connects commands and observations directly to the transactional kernel. */
export function bindSheetKernelCommands(
  container: Container,
  kernel: SheetKernel,
  runtime: SheetPluginSetupRuntime,
): void {
  const commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol),
    effects = container.resolve<SheetCommandEffectRegistry>(SheetCommandEffectRegistry.symbol);
  SheetInteractionStore.prototype.enforceCommandBoundary.call(
    runtime.interaction.store,
    commands.isExecuting.bind(commands),
    commands.runWithoutMutationAuthority.bind(commands),
  );
  runtime.extensions.register(SheetRuntimeCapability.Commands, commands);
  commands.bind({ executePipeline: kernel.executePipeline.bind(kernel), applyEffect: effects.dispatch.bind(effects) });
  runtime.observations.register(SheetCommitObservation, {
    getSnapshot: () => kernel.getCommitSnapshot(),
    subscribe: (listener) => kernel.subscribeCommits(listener),
  });
  container
    .resolve<DefaultSheetClipboardDataSource>(SheetClipboardDataSourceSymbol)
    .bindPreviewRuntime(
      kernel,
      runtime.plugins,
      container.hasBinding(SheetClipboardWorkbookBridgeSymbol)
        ? container.resolve<SheetClipboardWorkbookBridge>(SheetClipboardWorkbookBridgeSymbol)
        : null,
    );
}
