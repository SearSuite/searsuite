/** Tracks closing parentheses inserted by function suggestions during one edit session. */
export class FormulaAutoCloseTracker {
  private positions = new Set<number>();

  public clear(): void {
    this.positions.clear();
  }

  public add(position: number): void {
    this.positions.add(position);
  }

  public snapshot(): readonly number[] {
    return [...this.positions].sort((left, right) => left - right);
  }

  public restore(positions: readonly number[], text: string): void {
    this.positions = new Set(positions.filter((position) => text[position] === ')'));
  }

  public consume(position: number, text: string): boolean {
    if (text[position] !== ')') return false;
    return this.positions.delete(position);
  }

  public reconcile(before: string, after: string): void {
    if (before === after || this.positions.size === 0) return;
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
    let oldEnd = before.length;
    let newEnd = after.length;
    while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
      oldEnd -= 1;
      newEnd -= 1;
    }
    const shift = newEnd - oldEnd;
    this.positions = new Set(
      [...this.positions]
        .filter((position) => position < start || position >= oldEnd)
        .map((position) => (position >= oldEnd ? position + shift : position)),
    );
  }
}
