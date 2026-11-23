import { SearError } from '@searsuite/sear-foundation-error';

/** Result of validating a proposed cell edit. */
export interface SheetCellInputValidationResult {
  readonly valid: boolean;
  readonly reject: boolean;
  readonly message?: string;
  readonly ruleId?: string;
}

export type SheetCellInputValidator = (
  row: number,
  column: number,
  text: string,
) => SheetCellInputValidationResult;

/** Opts a validator into protection against clearing existing cell contents. */
export interface SheetCellInputValidatorOptions {
  readonly protectClear?: boolean;
}

function validateCellTextLimits(text: string): SheetCellInputValidationResult | null {
  if (text.length > 32767) {
    return { valid: false, reject: true, message: 'A cell can contain at most 32767 characters.' };
  }
  if ((text.match(/\n/g)?.length ?? 0) > 253) {
    return { valid: false, reject: true, message: 'A cell can contain at most 253 line breaks.' };
  }
  return null;
}

/** Editor-local validation contributions, evaluated before a cell edit commits. */
export class SheetCellInputValidationRegistry {
  public static readonly symbol = Symbol.for('SheetCellInputValidationRegistry');
  /** Excel-compatible limits shared by editing and clipboard paste. */
  public static validateTextLimits(text: string): SheetCellInputValidationResult | null {
    return validateCellTextLimits(text);
  }
  readonly #validators = new Map<string, { id: number; validator: SheetCellInputValidator; protectClear: boolean }>();
  #nextId = 0;
  #isCommandExecuting: (() => boolean) | null = null;
  #dispatchRemoval: ((id: number) => void) | null = null;
  #teardownToken: object | null = null;
  #tearingDown = false;

  public register(id: string, validator: SheetCellInputValidator, options: SheetCellInputValidatorOptions = {}): () => void {
    if (this.#tearingDown) throw new SearError('Cell input validation registry is being destroyed.');
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Cell input validator registration must run through editor.commands.run(...).');
    }
    if (this.#validators.has(id)) throw new SearError(`Cell input validator "${id}" is already registered.`, { id });
    const registrationId = this.#nextId++;
    this.#validators.set(id, { id: registrationId, validator, protectClear: options.protectClear ?? false });
    let disposed = false;
    return () => {
      if (disposed) return;
      this.unregister(registrationId);
      disposed = true;
    };
  }

  /** Removes one registration, dispatching through its command after assembly. */
  public unregister(registrationId: number): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting() && !this.#tearingDown) {
      this.#dispatchRemoval!(registrationId);
      return;
    }
    for (const [key, entry] of this.#validators) {
      if (entry.id !== registrationId) continue;
      this.#validators.delete(key);
      return;
    }
  }

  /** Closes direct writes once the editor finishes starting. */
  public enforceCommandBoundary(
    isExecuting: () => boolean,
    dispatchRemoval: (id: number) => void,
    teardownToken: object,
  ): void {
    if (this.#isCommandExecuting) throw new SearError('Cell input validation registry is already bound to an editor.');
    this.#isCommandExecuting = isExecuting;
    this.#dispatchRemoval = dispatchRemoval;
    this.#teardownToken = teardownToken;
    Object.preventExtensions(this);
  }

  /** Allows owner-controlled cleanup after command dispatch has ended. */
  public beginTeardown(token: object): void {
    if (!this.#teardownToken || token !== this.#teardownToken) {
      throw new SearError('Cell input validation cleanup requires its editor owner.');
    }
    this.#tearingDown = true;
  }

  public validate(row: number, column: number, text: string): SheetCellInputValidationResult {
    const limit = SheetCellInputValidationRegistry.validateTextLimits(text);
    if (limit) return limit;
    let warning: SheetCellInputValidationResult | null = null;
    for (const { validator } of this.#validators.values()) {
      const result = validator(row, column, text);
      if (result.reject) return result;
      if (!result.valid && !warning) warning = result;
    }
    return warning ?? { valid: true, reject: false };
  }

  /** Checks only validators that explicitly protect existing contents from clearing. */
  public validateClear(row: number, column: number): SheetCellInputValidationResult {
    for (const { validator, protectClear } of this.#validators.values()) {
      if (!protectClear) continue;
      const result = validator(row, column, '');
      if (result.reject) return result;
    }
    return { valid: true, reject: false };
  }
}

