import { type RuntimeCapability, type RuntimeCapabilityReader } from '@searsuite/sear-assembly-plugin';

interface ContractCommands {
  getRegisteredCommandIds(): readonly string[];
}

interface ContractObservations {
  getRegisteredObservations(): readonly unknown[];
}

export interface ContractEditor {
  readonly commands: ContractCommands;
  readonly observations: ContractObservations;
  readonly services: RuntimeCapabilityReader;
  destroy(): void;
}

export interface EditorLifecycleContractOptions {
  readonly createEditor: () => ContractEditor;
  readonly commandCapability: RuntimeCapability<ContractCommands>;
}

/** Shared behavioral contract required of every public editor assembly. */
export function runEditorLifecycleContract(name: string, options: EditorLifecycleContractOptions): void {
  describe(`${name} lifecycle contract`, () => {
    it('isolates two live instances and keeps the survivor usable after independent idempotent teardown', () => {
      const first = options.createEditor();
      const second = options.createEditor();

      expect(first.services.require(options.commandCapability)).toBe(first.commands);
      expect(second.services.require(options.commandCapability)).toBe(second.commands);
      expect(first.commands).not.toBe(second.commands);

      first.destroy();
      first.destroy();
      expect(() => first.commands.getRegisteredCommandIds()).toThrow(`${name}CommandBus has been destroyed.`);
      expect(() => first.observations.getRegisteredObservations()).toThrow('ObservationRegistry has been destroyed.');
      expect(() => first.services.require(options.commandCapability)).toThrow(
        `Runtime capability registry for ${name}Editor has been destroyed.`,
      );

      expect(second.commands.getRegisteredCommandIds().length).toBeGreaterThan(0);
      expect(second.observations.getRegisteredObservations().length).toBeGreaterThan(0);
      expect(second.services.require(options.commandCapability)).toBe(second.commands);
      second.destroy();
    });
  });
}
