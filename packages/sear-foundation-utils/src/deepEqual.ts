/** Compares acyclic values; Map keys and Set members retain identity semantics. */
export function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return typeof left === 'number' && typeof right === 'number' && Number.isNaN(left) && Number.isNaN(right);
  }
  if (left.constructor !== right.constructor) return false;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) {
      if (!deepEqual(left[index], right[index])) return false;
    }
    return true;
  }

  if (left instanceof Map && right instanceof Map) {
    if (left.size !== right.size) return false;
    for (const [key, value] of left) {
      if (!right.has(key) || !deepEqual(value, right.get(key))) return false;
    }
    return true;
  }

  if (left instanceof Set && right instanceof Set) {
    if (left.size !== right.size) return false;
    for (const value of left) {
      if (!right.has(value)) return false;
    }
    return true;
  }

  if (ArrayBuffer.isView(left) && ArrayBuffer.isView(right)) {
    if (left.byteLength !== right.byteLength) return false;
    if (left instanceof DataView && right instanceof DataView) return equalBytes(left, right);
    const values = left as unknown as ArrayLike<unknown>;
    const otherValues = right as unknown as ArrayLike<unknown>;
    for (let index = 0; index < values.length; index++) {
      if (values[index] !== otherValues[index]) return false;
    }
    return true;
  }

  if (left instanceof ArrayBuffer && right instanceof ArrayBuffer) return equalBytes(left, right);
  if (left instanceof RegExp && right instanceof RegExp)
    return left.source === right.source && left.flags === right.flags;
  const leftValueOf = left.valueOf;
  const rightValueOf = right.valueOf;
  if (typeof leftValueOf === 'function' && leftValueOf !== Object.prototype.valueOf) {
    return typeof rightValueOf === 'function' && leftValueOf.call(left) === rightValueOf.call(right);
  }
  if (typeof rightValueOf === 'function' && rightValueOf !== Object.prototype.valueOf) return false;
  const leftToString = left.toString;
  const rightToString = right.toString;
  if (typeof leftToString === 'function' && leftToString !== Object.prototype.toString) {
    return typeof rightToString === 'function' && leftToString.call(left) === rightToString.call(right);
  }
  if (typeof rightToString === 'function' && rightToString !== Object.prototype.toString) return false;

  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (
      !Object.prototype.hasOwnProperty.call(right, key) ||
      !deepEqual(left[key as keyof typeof left], right[key as keyof typeof right])
    ) {
      return false;
    }
  }
  return true;
}

function equalBytes(left: ArrayBufferView | ArrayBuffer, right: ArrayBufferView | ArrayBuffer): boolean {
  const leftBytes =
    left instanceof ArrayBuffer ? new Uint8Array(left) : new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
  const rightBytes =
    right instanceof ArrayBuffer
      ? new Uint8Array(right)
      : new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
  if (leftBytes.length !== rightBytes.length) return false;
  for (let index = 0; index < leftBytes.length; index++) {
    if (leftBytes[index] !== rightBytes[index]) return false;
  }
  return true;
}
