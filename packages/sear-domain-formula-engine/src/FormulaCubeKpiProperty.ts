/** Stable CUBE KPI property identifiers. */
export const FormulaCubeKpiProperty = {
  KPIValue: 1,
  KPIGoal: 2,
  KPIStatus: 3,
  KPITrend: 4,
  KPIWeight: 5,
  KPICurrentTimeMember: 6,
} as const;

/** Type contract carried by the canonical FormulaCubeKpiProperty value. */
export type FormulaCubeKpiProperty = (typeof FormulaCubeKpiProperty)[keyof typeof FormulaCubeKpiProperty];
