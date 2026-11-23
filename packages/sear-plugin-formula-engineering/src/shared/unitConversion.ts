import { notAvailableError } from './errors';

interface Unit {
  readonly dimension: string;
  readonly factor: number;
  readonly offset?: number;
  readonly prefixable?: boolean;
}

const units: Readonly<Record<string, Unit>> = {
  m: { dimension: 'length', factor: 1 },
  mi: { dimension: 'length', factor: 1609.344, prefixable: false },
  Nmi: { dimension: 'length', factor: 1852 },
  in: { dimension: 'length', factor: 0.0254 },
  ft: { dimension: 'length', factor: 0.3048, prefixable: false },
  yd: { dimension: 'length', factor: 0.9144 },
  ang: { dimension: 'length', factor: 1e-10 },
  ell: { dimension: 'length', factor: 1.143 },
  ly: { dimension: 'length', factor: 9.4607304725808e15 },
  parsec: { dimension: 'length', factor: 3.08567758149137e16 },
  Picapt: { dimension: 'length', factor: 0.000352777777777778 },
  pica: { dimension: 'length', factor: 0.00423333333333333 },
  survey_mi: { dimension: 'length', factor: 1609.34721869444 },
  g: { dimension: 'mass', factor: 1 },
  sg: { dimension: 'mass', factor: 14.5939029372064 },
  lbm: { dimension: 'mass', factor: 453.59237 },
  u: { dimension: 'mass', factor: 1.6605390666e-24 },
  ozm: { dimension: 'mass', factor: 28.349523125 },
  grain: { dimension: 'mass', factor: 0.06479891 },
  cwt: { dimension: 'mass', factor: 45359.237 },
  uk_cwt: { dimension: 'mass', factor: 50802.34544 },
  stone: { dimension: 'mass', factor: 6350.29318 },
  ton: { dimension: 'mass', factor: 907184.74 },
  uk_ton: { dimension: 'mass', factor: 1016046.9088 },
  sec: { dimension: 'time', factor: 1 },
  mn: { dimension: 'time', factor: 60 },
  hr: { dimension: 'time', factor: 3600 },
  day: { dimension: 'time', factor: 86400 },
  yr: { dimension: 'time', factor: 31557600 },
  Pa: { dimension: 'pressure', factor: 1 },
  atm: { dimension: 'pressure', factor: 101325 },
  mmHg: { dimension: 'pressure', factor: 133.322387415 },
  Torr: { dimension: 'pressure', factor: 133.322368421 },
  psi: { dimension: 'pressure', factor: 6894.757293168 },
  N: { dimension: 'force', factor: 1 },
  dyn: { dimension: 'force', factor: 1e-5 },
  lbf: { dimension: 'force', factor: 4.4482216152605 },
  pond: { dimension: 'force', factor: 0.00980665 },
  J: { dimension: 'energy', factor: 1 },
  e: { dimension: 'energy', factor: 1e-7 },
  c: { dimension: 'energy', factor: 4.184 },
  cal: { dimension: 'energy', factor: 4.1868 },
  eV: { dimension: 'energy', factor: 1.602176634e-19 },
  HPh: { dimension: 'energy', factor: 2684519.53769617 },
  Wh: { dimension: 'energy', factor: 3600 },
  flb: { dimension: 'energy', factor: 1.3558179483314 },
  BTU: { dimension: 'energy', factor: 1055.05585262 },
  HP: { dimension: 'power', factor: 745.69987158227 },
  PS: { dimension: 'power', factor: 735.49875 },
  W: { dimension: 'power', factor: 1 },
  T: { dimension: 'magnetism', factor: 1 },
  ga: { dimension: 'magnetism', factor: 1e-4 },
  tsp: { dimension: 'volume', factor: 0.00000492892159375 },
  tspm: { dimension: 'volume', factor: 0.000005 },
  tbs: { dimension: 'volume', factor: 0.00001478676478125 },
  oz: { dimension: 'volume', factor: 0.0000295735295625 },
  cup: { dimension: 'volume', factor: 0.0002365882365 },
  pt: { dimension: 'volume', factor: 0.000473176473 },
  us_pt: { dimension: 'volume', factor: 0.000473176473 },
  uk_pt: { dimension: 'volume', factor: 0.00056826125 },
  qt: { dimension: 'volume', factor: 0.000946352946 },
  uk_qt: { dimension: 'volume', factor: 0.0011365225 },
  gal: { dimension: 'volume', factor: 0.003785411784 },
  uk_gal: { dimension: 'volume', factor: 0.00454609 },
  l: { dimension: 'volume', factor: 0.001 },
  L: { dimension: 'volume', factor: 0.001 },
  lt: { dimension: 'volume', factor: 0.001 },
  m3: { dimension: 'volume', factor: 1 },
  ang3: { dimension: 'volume', factor: 1e-30 },
  barrel: { dimension: 'volume', factor: 0.158987294928 },
  bushel: { dimension: 'volume', factor: 0.03523907016688 },
  Mton: { dimension: 'volume', factor: 1.13267386368 },
  GRT: { dimension: 'volume', factor: 2.8316846592 },
  regton: { dimension: 'volume', factor: 2.8316846592 },
  m2: { dimension: 'area', factor: 1 },
  mi2: { dimension: 'area', factor: 2589988.110336 },
  Nmi2: { dimension: 'area', factor: 3429904 },
  in2: { dimension: 'area', factor: 0.00064516 },
  ft2: { dimension: 'area', factor: 0.09290304 },
  yd2: { dimension: 'area', factor: 0.83612736 },
  ang2: { dimension: 'area', factor: 1e-20 },
  ha: { dimension: 'area', factor: 10000 },
  acre: { dimension: 'area', factor: 4046.8564224 },
  'm/s': { dimension: 'speed', factor: 1 },
  'm/sec': { dimension: 'speed', factor: 1 },
  'mi/hr': { dimension: 'speed', factor: 0.44704 },
  mph: { dimension: 'speed', factor: 0.44704 },
  knot: { dimension: 'speed', factor: 0.514444444444444 },
  kn: { dimension: 'speed', factor: 0.514444444444444 },
  admkn: { dimension: 'speed', factor: 0.514773333333333 },
  'km/hr': { dimension: 'speed', factor: 0.277777777777778 },
  bit: { dimension: 'information', factor: 1 },
  byte: { dimension: 'information', factor: 8 },
};

const prefixes: Readonly<Record<string, number>> = {
  Y: 1e24,
  Z: 1e21,
  E: 1e18,
  P: 1e15,
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  h: 1e2,
  da: 1e1,
  d: 1e-1,
  c: 1e-2,
  m: 1e-3,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
  a: 1e-18,
  z: 1e-21,
  y: 1e-24,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
  Zi: 1024 ** 7,
  Yi: 1024 ** 8,
};

function resolveUnit(name: string): Unit | undefined {
  if (name === 'C' || name === 'cel') return { dimension: 'temperature', factor: 1, offset: 273.15 };
  if (name === 'K' || name === 'kel') return { dimension: 'temperature', factor: 1, offset: 0 };
  if (name === 'F' || name === 'fah') return { dimension: 'temperature', factor: 5 / 9, offset: 255.3722222222222 };
  if (name === 'Rank') return { dimension: 'temperature', factor: 5 / 9, offset: 0 };
  if (name === 'Reau') return { dimension: 'temperature', factor: 1.25, offset: 273.15 };
  if (units[name]) return units[name];
  for (const prefix of Object.keys(prefixes).sort((a, b) => b.length - a.length)) {
    const base = name.slice(prefix.length);
    if (name.startsWith(prefix) && units[base]) {
      const unit = units[base]!;
      if (unit.prefixable === false) continue;
      if (prefix.endsWith('i') && unit.dimension !== 'information') continue;
      const power = unit.dimension === 'area' ? 2 : unit.dimension === 'volume' ? 3 : 1;
      return { ...unit, factor: unit.factor * prefixes[prefix]! ** power };
    }
  }
  return undefined;
}

export function convertUnit(
  value: number,
  fromName: string,
  toName: string,
): number | ReturnType<typeof notAvailableError> {
  const from = resolveUnit(fromName);
  const to = resolveUnit(toName);
  if (!from || !to || from.dimension !== to.dimension) return notAvailableError();
  if (fromName === toName) return value;
  const fromCelsius = fromName === 'C' || fromName === 'cel';
  const toCelsius = toName === 'C' || toName === 'cel';
  const fromFahrenheit = fromName === 'F' || fromName === 'fah';
  const toFahrenheit = toName === 'F' || toName === 'fah';
  if (fromCelsius && toFahrenheit) return value * 9 / 5 + 32;
  if (fromFahrenheit && toCelsius) return (value - 32) * 5 / 9;
  const canonical = value * from.factor + (from.offset ?? 0);
  return (canonical - (to.offset ?? 0)) / to.factor;
}
