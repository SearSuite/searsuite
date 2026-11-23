import { besselI0, besselI1 } from './excelBesselK';

export function besselJ0(x: number): number {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    return (
      (57568490574 +
        y * (-13362590354 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))))) /
      (57568490411 + y * (1029532985 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y)))))
    );
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 0.785398164;
  return (
    Math.sqrt(0.636619772 / ax) *
    (Math.cos(xx) *
      (1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)))) -
      z *
        Math.sin(xx) *
        (-0.1562499995e-1 +
          y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934945152e-7)))))
  );
}

export function besselJ1(x: number): number {
  const ax = Math.abs(x);
  let result: number;
  if (ax < 8) {
    const y = x * x;
    result =
      (x *
        (72362614232 +
          y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))))) /
      (144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y)))));
  } else {
    const z = 8 / ax;
    const y = z * z;
    const xx = ax - 2.356194491;
    result =
      Math.sqrt(0.636619772 / ax) *
      (Math.cos(xx) * (1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)))) -
        z *
          Math.sin(xx) *
          (0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)))));
    if (x < 0) result = -result;
  }
  return result;
}

export function besselJ(n: number, x: number): number {
  if (n === 0) return besselJ0(x);
  if (n === 1) return besselJ1(x);
  if (x === 0) return 0;
  if (Math.abs(x) < 0.1) {
    let term = Math.pow(x / 2, n) / factorial(n);
    let sum = term;
    for (let k = 1; k < 200; k++) {
      term *= -(x * x) / (4 * k * (n + k));
      sum += term;
      if (Math.abs(term) <= Math.abs(sum) * Number.EPSILON) break;
    }
    return sum;
  }
  if (Math.abs(x) <= n) {
    const magnitude = Math.abs(x);
    const reciprocal = 2 / magnitude;
    const startOrder = 2 * Math.floor((n + Math.floor(Math.sqrt(40 * n))) / 2);
    let previous = 0;
    let current = 1;
    let total = 0;
    let result = 0;
    let addToTotal = false;
    for (let order = startOrder; order > 0; order--) {
      const next = order * reciprocal * current - previous;
      previous = current;
      current = next;
      if (Math.abs(current) > 1e10) {
        current *= 1e-10;
        previous *= 1e-10;
        result *= 1e-10;
        total *= 1e-10;
      }
      if (addToTotal) total += current;
      addToTotal = !addToTotal;
      if (order === n) result = previous;
    }
    const normalized = result / (2 * total - current);
    return x < 0 && n % 2 !== 0 ? -normalized : normalized;
  }
  let previous = besselJ0(x);
  let current = besselJ1(x);
  for (let order = 1; order < n; order++) [previous, current] = [current, ((2 * order) / x) * current - previous];
  return current;
}

export function besselY0(x: number): number {
  if (x < 8) {
    const y = x * x;
    return (
      (-2957821389 + y * (7062834065 + y * (-512359803.6 + y * (10879881.29 + y * (-86327.92757 + y * 228.4622733))))) /
        (40076544269 + y * (745249964.8 + y * (7189466.438 + y * (47447.2647 + y * (226.1030244 + y))))) +
      0.636619772 * besselJ0(x) * Math.log(x)
    );
  }
  const z = 8 / x;
  const y = z * z;
  const xx = x - 0.785398164;
  return (
    Math.sqrt(0.636619772 / x) *
    (Math.sin(xx) *
      (1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)))) +
      z *
        Math.cos(xx) *
        (-0.1562499995e-1 +
          y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934945152e-7)))))
  );
}

export function besselY1(x: number): number {
  if (x < 8) {
    const y = x * x;
    return (
      (x *
        (-0.4900604943e13 +
          y *
            (0.127527439e13 +
              y * (-0.5153438139e11 + y * (0.7349264551e9 + y * (-0.4237922726e7 + y * 0.8511937935e4)))))) /
        (0.249958057e14 +
          y *
            (0.4244419664e12 +
              y * (0.3733650367e10 + y * (0.2245904002e8 + y * (0.102042605e6 + y * (0.3549632885e3 + y)))))) +
      0.636619772 * (besselJ1(x) * Math.log(x) - 1 / x)
    );
  }
  const z = 8 / x;
  const y = z * z;
  const xx = x - 2.356194491;
  return (
    Math.sqrt(0.636619772 / x) *
    (Math.sin(xx) * (1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)))) +
      z *
        Math.cos(xx) *
        (0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)))))
  );
}

export function besselY(n: number, x: number): number {
  if (n === 0) return besselY0(x);
  if (n === 1) return besselY1(x);
  let previous = besselY0(x);
  let current = besselY1(x);
  for (let order = 1; order < n; order++) [previous, current] = [current, ((2 * order) / x) * current - previous];
  return current;
}

export function besselI(n: number, x: number): number {
  if (n === 0) return besselI0(x);
  if (n === 1) return besselI1(x);
  if (x === 0) return 0;
  if (Math.abs(x) < 0.1) {
    let term = Math.pow(x / 2, n) / factorial(n);
    let sum = term;
    for (let k = 1; k < 200; k++) {
      term *= (x * x) / 4 / (k * (n + k));
      sum += term;
      if (Math.abs(term) <= Math.abs(sum) * 1e-16) break;
    }
    return sum;
  }
  const magnitude = Math.abs(x);
  const reciprocal = 2 / magnitude;
  const startOrder = 2 * (n + Math.floor(Math.sqrt(40 * n)));
  let previous = 0;
  let current = 1;
  let result = 0;
  for (let order = startOrder; order > 0; order--) {
    const next = previous + order * reciprocal * current;
    previous = current;
    current = next;
    if (Math.abs(current) > 1e10) {
      current *= 1e-10;
      previous *= 1e-10;
      result *= 1e-10;
    }
    if (order === n) result = previous;
  }
  const normalized = result * besselI0(magnitude) / current;
  return x < 0 && n % 2 !== 0 ? -normalized : normalized;
}

function factorial(n: number): number {
  let result = 1;
  for (let value = 2; value <= n; value++) result *= value;
  return result;
}
