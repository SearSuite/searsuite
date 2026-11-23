import { defineRuntimeCapability } from '@searsuite/sear-assembly-plugin';
import { SearError } from '@searsuite/sear-foundation-error';
import { DataValidationKind, type DataValidationCondition } from './DataValidationRule';

const externalKinds = new Set<DataValidationKind>([
  DataValidationKind.Person, DataValidationKind.Document, DataValidationKind.Image,
  DataValidationKind.Attachment, DataValidationKind.Formula,
]);

export type DataValidationExternalEvaluator = (
  condition: DataValidationCondition, text: string, row: number, column: number,
) => boolean | null;

/** Host extension point for structured values and custom formulas. */
export class DataValidationEvaluatorRegistry {
  readonly #evaluators = new Map<DataValidationKind, { id: number; evaluator: DataValidationExternalEvaluator }>();
  #nextId = 0;
  #isCommandExecuting: (() => boolean) | null = null;
  #dispatchRemoval: ((id: number) => void) | null = null;

  /** Whether this editor can evaluate the kind without guessing a result. */
  public canEvaluate(kind: DataValidationKind): boolean {
    return !externalKinds.has(kind) || this.#evaluators.has(kind);
  }

  public register(kind: DataValidationKind, evaluator: DataValidationExternalEvaluator): () => void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Data validation evaluator registration must run through editor.commands.run(...).');
    }
    if (this.#evaluators.has(kind)) throw new SearError('Data validation evaluator is already registered.', { kind });
    const id = this.#nextId++;
    this.#evaluators.set(kind, { id, evaluator });
    let disposed = false;
    return () => {
      if (disposed) return;
      this.unregister(id);
      disposed = true;
    };
  }

  /** Removes a registration through the owning command after assembly. */
  public unregister(id: number): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      this.#dispatchRemoval!(id);
      return;
    }
    for (const [kind, entry] of this.#evaluators) {
      if (entry.id !== id) continue;
      this.#evaluators.delete(kind);
      return;
    }
  }

  /** Seals post-assembly writes without adding work to evaluator reads. */
  public enforceCommandBoundary(isExecuting: () => boolean, dispatchRemoval: (id: number) => void): void {
    if (this.#isCommandExecuting) throw new SearError('Data validation evaluator registry is already bound to an editor.');
    this.#isCommandExecuting = isExecuting;
    this.#dispatchRemoval = dispatchRemoval;
    Object.preventExtensions(this);
  }

  public evaluate(condition: DataValidationCondition, text: string, row: number, column: number): boolean | null {
    return this.#evaluators.get(condition.kind)?.evaluator(condition, text, row, column) ?? null;
  }
}

export const DataValidationEvaluatorRegistryCapability =
  defineRuntimeCapability<DataValidationEvaluatorRegistry>('sheet.dataValidation.evaluators');
