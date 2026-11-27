import { CellDisplayTextRegistry } from '@searsuite/sear-domain-cell';
import { type Container } from '@searsuite/sear-foundation-di';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import {
  EditorLifecycleStack,
  cloneSessionStateValue,
  RuntimeCapabilityRegistry,
  SheetFormatTransferRegistry,
  SheetClipboardTransferRegistry,
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  SheetStructureMoveRegistry,
  sealSheetContributionWrites,
} from '@searsuite/sear-assembly-plugin';
import {
  SheetCommandBus,
  SheetQueryRegistry,
  SheetCommandEffectRegistry,
  type SheetPluginSetupRuntime,
} from '@searsuite/sear-assembly-commands';
import {
  CellCommitStrategyRegistry,
  CellClipboardCodecRegistry,
  CellFormatTransferRegistry,
  SheetCellInputValidationRegistry,
  SheetDisplayedValueChanges,
  SheetCellStyleRegistry,
  SheetRulePriorityRegistry,
  sealCellExtensionWrites,
} from '@searsuite/sear-domain-cell-types';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import {
  CollaborationChannel,
  CollaborationChannelBinding,
  ApplySheetCollaborationEventCommand,
} from '@searsuite/sear-plugin-collab';
import {
  FormulaRegistryOwnership,
  SheetFormulaPlugin,
  CellFormulaValueConverterRegistry,
} from '@searsuite/sear-plugin-formula';
import { UnregisterSheetInputValidatorCommand } from './SheetInputValidationCommands';
import { sealSheetPluginTeardownWrites } from './sealSheetPluginTeardownWrites';
import { SearContractViolationError } from '@searsuite/sear-assembly-plugin';

/** Seals editor-owned business registries and grants teardown authority only to the editor owner. */
export function sealSheetKernelRuntime(
  container: Container,
  runtime: SheetPluginSetupRuntime,
  lifecycle: EditorLifecycleStack,
): () => void {
  const commands = container.resolve<SheetCommandBus>(SheetCommandBus.symbol);
  let tearingDown = false;
  lifecycle.add(() => {
    tearingDown = true;
  });
  const assertWrite = (): void => {
    if (!tearingDown && !commands.isExecuting())
      throw new SearContractViolationError('Sheet extensions must change through editor.commands.run(...).');
  };
  const binding = container.resolve<CollaborationChannelBinding>(CollaborationChannelBinding.symbol);
  if (binding.owner === 'editor')
    CollaborationChannel.prototype.enforceCommandBoundary.call(
      binding.channel,
      assertWrite,
      commands.runWithoutMutationAuthority.bind(commands),
      (event) => commands.run(ApplySheetCollaborationEventCommand, event),
    );
  SheetQueryRegistry.prototype.enforceWriteBoundary.call(runtime.queries, assertWrite);
  ObservationRegistry.prototype.enforceWriteBoundary.call(
    runtime.observations,
    assertWrite,
    commands.runWithoutMutationAuthority.bind(commands),
    cloneSessionStateValue,
  );
  SheetDisplayedValueChanges.prototype.enforceCommandBoundary.call(
    container.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol),
    commands.isExecuting.bind(commands),
    commands.runWithoutMutationAuthority.bind(commands),
  );
  RuntimeCapabilityRegistry.prototype.enforceWriteBoundary.call(runtime.extensions, assertWrite);
  [
    runtime.cells.catalog,
    container.resolve<CellCommitStrategyRegistry>(CellCommitStrategyRegistry.symbol),
    container.resolve<CellDisplayTextRegistry>(CellDisplayTextRegistry.symbol),
    container.resolve<CellClipboardCodecRegistry>(CellClipboardCodecRegistry.symbol),
    container.resolve<CellFormatTransferRegistry>(CellFormatTransferRegistry.symbol),
    container.resolve<CellFormulaValueConverterRegistry>(CellFormulaValueConverterRegistry.symbol),
    container.resolve<SheetCellStyleRegistry>(SheetCellStyleRegistry.symbol),
    container.resolve<SheetRulePriorityRegistry>(SheetRulePriorityRegistry.symbol),
  ].forEach((owner) => sealCellExtensionWrites(owner, assertWrite));
  [
    container.resolve<SheetFormatTransferRegistry>(SheetFormatTransferRegistry.symbol),
    container.resolve<SheetClipboardTransferRegistry>(SheetClipboardTransferRegistry.symbol),
    container.resolve<SheetCommandEffectRegistry>(SheetCommandEffectRegistry.symbol),
    container.resolve<SheetRangeMoveRegistry>(SheetRangeMoveRegistry.symbol),
    container.resolve<SheetRangeReorderRegistry>(SheetRangeReorderRegistry.symbol),
    container.resolve<SheetStructureMoveRegistry>(SheetStructureMoveRegistry.symbol),
    runtime.interaction.reducers,
    runtime.interaction.pipelineSteps,
  ].forEach((owner) => sealSheetContributionWrites(owner, assertWrite));
  const validation = container.resolve<SheetCellInputValidationRegistry>(SheetCellInputValidationRegistry.symbol),
    validationToken = {};
  lifecycle.add(() => validation.beginTeardown(validationToken));
  SheetCellInputValidationRegistry.prototype.enforceCommandBoundary.call(
    validation,
    commands.isExecuting.bind(commands),
    (id) => commands.run(UnregisterSheetInputValidatorCommand, id),
    validationToken,
  );
  const plugins = runtime.plugins.getAllPlugins();
  for (const plugin of plugins) {
    const seal = Object.getPrototypeOf(plugin).sealRuntimeWrites;
    if (typeof seal === 'function') seal.call(plugin);
    else plugin.sealRuntimeWrites?.();
  }
  sealSheetPluginTeardownWrites(plugins, assertWrite);
  SheetFormulaPlugin.prototype.enforceProviderCommandBoundary.call(
    container.resolve<SheetFormulaPlugin>(SheetFormulaPlugin.symbol),
    commands,
    container.hasBinding(FormulaRegistryOwnership.symbol)
      ? container.resolve<FormulaRegistryOwnership>(FormulaRegistryOwnership.symbol)
      : undefined,
  );
  ConfigEngine.prototype.enforceCommandBoundary.call(runtime.config, commands.isExecuting.bind(commands));
  return assertWrite;
}
