import { SearError } from '@searsuite/sear-foundation-error';

/** State ownership and reduction without any scene, input, or drawing contract. */
export abstract class StatePlugin<State, Transaction> {
  #state: State;
  #stateCommitToken: object | undefined;

  /** Adopts initial state; the composition root subsequently installs its write boundary. */
  constructor(state: State) {
    this.#state = state;
  }

  /** Reads this owner's currently committed value. */
  public getState(): State {
    return this.#state;
  }

  /** Reserves state replacement for successful kernel publication. */
  public enforceStateWriteBoundary(commitToken: object): void {
    if (this.#stateCommitToken) throw new SearError('Plugin state write boundary is already installed.');
    this.#stateCommitToken = commitToken;
  }

  /** Reports whether a kernel has adopted this owner. */
  public hasStateWriteBoundary(): boolean {
    return this.#stateCommitToken !== undefined;
  }

  /** Publishes a prepared state using the composition root's exclusive token. */
  public setState(state: State, commitToken?: object): void {
    if (this.#stateCommitToken && commitToken !== this.#stateCommitToken)
      throw new SearError('Committed plugin state can only change through a command transaction.');
    this.#state = state;
  }

  /** Reduces a detached prospective state; null means this transaction did not change it. */
  public abstract apply(state: State, transaction: Transaction): State | null;
}
