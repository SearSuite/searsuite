/** Excel-compatible modified Bessel K approximation for nonnegative integer orders. */

export function besselI0(x: number): number {
  const ax = Math.abs(x);
  if (ax <= 3.75) {
    const y = (ax / 3.75) ** 2;
    return 1 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813)))));
  }
  const y = 3.75 / ax;
  return (
    (Math.exp(ax) / Math.sqrt(ax)) *
    (0.39894228 +
      y *
        (0.01328592 +
          y *
            (0.00225319 +
              y *
                (-0.00157565 +
                  y * (0.00916281 + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))))
  );
}

export function besselI1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const y = (ax / 3.75) ** 2;
    return (
      x *
      (0.5 +
        y * (0.87890594 + y * (0.51498869 + y * (0.15084934 + y * (0.02658733 + y * (0.00301532 + y * 0.00032411))))))
    );
  }
  const y = 3.75 / ax;
  const result = (
    (Math.exp(ax) / Math.sqrt(ax)) *
    (0.39894228 +
      y *
        (-0.03988024 +
          y *
            (-0.00362018 +
              y *
                (0.00163801 +
                  y * (-0.01031555 + y * (0.02282967 + y * (-0.02895312 + y * (0.01787654 - y * 0.00420059))))))))
  );
  return x < 0 ? -result : result;
}

function besselK0(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    return (
      -Math.log(x / 2) * besselI0(x) +
      (-0.57721566 +
        y * (0.4227842 + y * (0.23069756 + y * (0.0348859 + y * (0.00262698 + y * (0.0001075 + y * 0.0000074))))))
    );
  }
  const y = 2 / x;
  return (
    (Math.exp(-x) / Math.sqrt(x)) *
    (1.25331414 +
      y * (-0.07832358 + y * (0.02189568 + y * (-0.01062446 + y * (0.00587872 + y * (-0.0025154 + y * 0.00053208))))))
  );
}

function besselK1(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    return (
      Math.log(x / 2) * besselI1(x) +
      (1 / x) *
        (1 +
          y *
            (0.15443144 +
              y * (-0.67278579 + y * (-0.18156897 + y * (-0.01919402 + y * (-0.00110404 - y * 0.00004686))))))
    );
  }
  const y = 2 / x;
  return (
    (Math.exp(-x) / Math.sqrt(x)) *
    (1.25331414 +
      y * (0.23498619 + y * (-0.0365562 + y * (0.01504268 + y * (-0.00780353 + y * (0.00325614 - y * 0.00068245))))))
  );
}

export function excelBesselK(order: number, x: number): number {
  if (order === 0) return besselK0(x);
  if (order === 1) return besselK1(x);
  let previous = besselK0(x);
  let current = besselK1(x);
  for (let index = 1; index < order; index++) {
    [previous, current] = [current, previous + (2 * index * current) / x];
  }
  return current;
}
