/** Listener invoked after a state object mutates. */
export type Listener = () => void;

/** Minimal operation shape accepted by generic domain states. */
export interface StateOperation {
  /** Path locating the operation target inside the state object. */
  p: (string | number)[];
}

/**
 * Observable base contract for domain state containers.
 *
 * State implementations expose cell-like reads, OT dispatch, and change
 * notifications while owning their concrete storage strategy.
 *
 * @template T - Value type stored by the state object.
 */
export abstract class SearState<T> {
  /** Registered listeners notified after successful mutations. */
  protected listeners: Listener[] = [];

  /**
   * Registers a listener for future state changes.
   * @param listener - Callback invoked after notifyListeners().
   */
  addListener(listener: Listener) {
    this.listeners.push(listener);
  }

  /**
   * Removes a previously registered listener.
   * @param listener - Callback to detach from this state object.
   */
  removeListener(listener: Listener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /** Notifies all registered listeners that this state object changed. */
  protected notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Reads one value from the state using a row/column style address.
   * @param row - Row or first path coordinate.
   * @param col - Column or second path coordinate.
   * @returns Stored value, null when no value is present.
   */
  abstract getItem(row: number | string, col: number | string): T | null;

  /**
   * Applies OT operations to this state object.
   * @param operations - Operations owned by the concrete state implementation.
   * @returns The current state instance for chaining.
   */
  abstract dispatch(operations: StateOperation[]): this;

  /** Stable state name used when registering state in plugin/core maps. */
  abstract name: string;
}
