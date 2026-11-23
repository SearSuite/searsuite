import { defineSheetCommand, LocalActionCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { FormulaResultProviderRegistry } from './FormulaResultProviderRegistry';
import { FormulaRichResultProviderRegistry } from './FormulaRichResultProviderRegistry';
import { FormulaSourceProviderRegistry } from './FormulaSourceProviderRegistry';

/** Formula-owned provider families sharing one editor-local unregister command. */
export const FormulaProviderKind = {
  Result: 'result',
  RichResult: 'richResult',
  Source: 'source',
} as const;
export type FormulaProviderKind = (typeof FormulaProviderKind)[keyof typeof FormulaProviderKind];

export interface UnregisterFormulaProviderInput {
  readonly kind: FormulaProviderKind;
  readonly registrationId: number;
}

/** Removes an editor-local formula provider registration. */
export const UnregisterFormulaProviderCommand =
  defineSheetCommand<UnregisterFormulaProviderInput>('sheet.formula.provider.unregister');

export interface FormulaProviderRegistries {
  readonly results: FormulaResultProviderRegistry;
  readonly richResults: FormulaRichResultProviderRegistry;
  readonly sources: FormulaSourceProviderRegistry;
}

/** Registers formula-owned provider disposal through the Sheet command bus. */
export function registerFormulaProviderCommands(commands: SheetCommandBus, registries: FormulaProviderRegistries): void {
  commands.register(UnregisterFormulaProviderCommand, ({ kind, registrationId }) =>
    new LocalActionCommand(UnregisterFormulaProviderCommand.id, () => {
      switch (kind) {
        case FormulaProviderKind.Result:
          registries.results.unregister(registrationId);
          break;
        case FormulaProviderKind.RichResult:
          registries.richResults.unregister(registrationId);
          break;
        case FormulaProviderKind.Source:
          registries.sources.unregister(registrationId);
          break;
      }
    }));
}

/** Closes direct writes after Sheet plugin initialization. */
export function sealFormulaProviderRegistries(commands: SheetCommandBus, registries: FormulaProviderRegistries): void {
  const isExecuting = commands.isExecuting.bind(commands);
  FormulaResultProviderRegistry.prototype.enforceCommandBoundary.call(registries.results, isExecuting, (registrationId) =>
    commands.run(UnregisterFormulaProviderCommand, { kind: FormulaProviderKind.Result, registrationId }));
  FormulaRichResultProviderRegistry.prototype.enforceCommandBoundary.call(registries.richResults, isExecuting, (registrationId) =>
    commands.run(UnregisterFormulaProviderCommand, { kind: FormulaProviderKind.RichResult, registrationId }));
  FormulaSourceProviderRegistry.prototype.enforceCommandBoundary.call(registries.sources, isExecuting, (registrationId) =>
    commands.run(UnregisterFormulaProviderCommand, { kind: FormulaProviderKind.Source, registrationId }));
}
