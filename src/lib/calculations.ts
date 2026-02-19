import type {
  Property,
  Unit,
  Tenant,
  Expense,
  Payment,
  DashboardStats,
  PropertySummary,
} from '../types';


// Parse as local date (noon avoids DST edge cases) so month comparison is correct in all timezones
function isInMonth(dateStr: string, year: number, month: number): boolean {
  const d = new Date(dateStr + 'T12:00:00');
  return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
}

export function getExpectedMonthlyRent(tenants: Tenant[]): number {
  return tenants.reduce((sum, t) => sum + t.monthlyRent, 0);
}

export function getCollectedThisMonth(payments: Payment[], year: number, month: number): number {
  return payments
    .filter((p) => isInMonth(p.date, year, month))
    .reduce((sum, p) => sum + p.amount, 0);
}

export function getExpensesThisMonth(expenses: Expense[], year: number, month: number): number {
  return expenses
    .filter((e) => isInMonth(e.date, year, month))
    .reduce((sum, e) => sum + e.amount, 0);
}

export function getYTDIncome(payments: Payment[], year: number): number {
  return payments
    .filter((p) => new Date(p.date + 'T12:00:00').getFullYear() === year)
    .reduce((sum, p) => sum + p.amount, 0);
}

export function getYTDExpenses(expenses: Expense[], year: number): number {
  return expenses
    .filter((e) => new Date(e.date + 'T12:00:00').getFullYear() === year)
    .reduce((sum, e) => sum + e.amount, 0);
}

export function getPropertySummary(
  property: Property,
  units: Unit[],
  tenants: Tenant[],
  expenses: Expense[],
  payments: Payment[]
): PropertySummary {
  const propUnits = units.filter((u) => u.propertyId === property.id);
  const propTenants = tenants.filter((t) => t.propertyId === property.id);
  const propExpenses = expenses.filter((e) => e.propertyId === property.id);
  const propPayments = payments.filter((p) => p.propertyId === property.id);

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const totalMonthlyRent = propTenants.reduce((s, t) => s + t.monthlyRent, 0);
  const collectedThisMonth = getCollectedThisMonth(propPayments, y, m);
  const expensesThisMonth = getExpensesThisMonth(propExpenses, y, m);
  const occupiedCount = propTenants.length;
  const unitCount = propUnits.length;
  const occupancyRate = unitCount > 0 ? (occupiedCount / unitCount) * 100 : 0;

  return {
    property,
    unitCount,
    occupiedUnits: occupiedCount,
    totalMonthlyRent,
    collectedThisMonth,
    expensesThisMonth,
    netThisMonth: collectedThisMonth - expensesThisMonth,
    occupancyRate,
  };
}

export function getDashboardStats(
  properties: Property[],
  units: Unit[],
  tenants: Tenant[],
  expenses: Expense[],
  payments: Payment[]
): DashboardStats {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const expectedMonthlyRent = getExpectedMonthlyRent(tenants);
  const collectedThisMonth = getCollectedThisMonth(payments, y, m);
  const expensesThisMonth = getExpensesThisMonth(expenses, y, m);
  const totalUnits = units.length;
  const occupiedUnits = tenants.length;
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
  const ytdIncome = getYTDIncome(payments, y);
  const ytdExpenses = getYTDExpenses(expenses, y);

  return {
    totalProperties: properties.length,
    totalUnits,
    occupiedUnits,
    occupancyRate,
    expectedMonthlyRent,
    collectedThisMonth,
    expensesThisMonth,
    netCashFlow: collectedThisMonth - expensesThisMonth,
    ytdIncome,
    ytdExpenses,
  };
}

// Lease status helper
export type LeaseStatus = 'active' | 'expiring' | 'expired'

export function getLeaseStatus(leaseEnd: string, warningDays = 90): LeaseStatus {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(leaseEnd + 'T12:00:00')
  if (Number.isNaN(end.getTime())) return 'active'
  const endStart = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  if (endStart < todayStart) return 'expired'
  const cutoff = new Date(todayStart)
  cutoff.setDate(cutoff.getDate() + warningDays)
  if (endStart <= cutoff) return 'expiring'
  return 'active'
}

// Rent roll: which tenants have paid for a given month
export interface RentRollItem {
  tenant: Tenant;
  unit: Unit;
  property: Property;
  expectedRent: number;
  paidAmount: number;
  paid: boolean;
  paymentDate?: string;
}

export function getRentRollForMonth(
  year: number,
  month: number,
  properties: Property[],
  units: Unit[],
  tenants: Tenant[],
  payments: Payment[]
): RentRollItem[] {
  const items: RentRollItem[] = []
  for (const tenant of tenants) {
    const unit = units.find((u) => u.id === tenant.unitId)
    const property = unit ? properties.find((p) => p.id === unit.propertyId) : undefined
    if (!unit || !property) continue
    const monthPayments = payments.filter(
      (p) => p.tenantId === tenant.id && isInMonth(p.date, year, month)
    )
    const paidAmount = monthPayments.reduce((s, p) => s + p.amount, 0)
    const latestPayment = [...monthPayments].sort((a, b) => b.date.localeCompare(a.date))[0]
    items.push({
      tenant,
      unit,
      property,
      expectedRent: tenant.monthlyRent,
      paidAmount,
      paid: paidAmount >= tenant.monthlyRent,
      paymentDate: latestPayment?.date,
    })
  }
  return items.sort((a, b) => a.property.name.localeCompare(b.property.name) || a.tenant.name.localeCompare(b.tenant.name))
}

// ─── Investment Metrics ──────────────────────────────────────────────────────

export interface InvestmentMetrics {
  annualIncome: number;
  annualExpenses: number;
  annualMortgage: number;
  noi: number;
  capRate: number | null;
  cashOnCash: number | null;
  expenseRatio: number | null;
  grm: number | null;
  monthlyVacancyLoss: number;
  annualVacancyLoss: number;
}

export function getInvestmentMetrics(
  properties: Property[],
  units: Unit[],
  tenants: Tenant[],
  expenses: Expense[],
  payments: Payment[],
  year: number,
  propertyId?: string,
): InvestmentMetrics {
  const filteredPayments = propertyId ? payments.filter((x) => x.propertyId === propertyId) : payments;
  const filteredExpenses = propertyId ? expenses.filter((x) => x.propertyId === propertyId) : expenses;

  const yearPayments = filteredPayments.filter(
    (p) => new Date(p.date + 'T12:00:00').getFullYear() === year,
  );
  const yearExpenses = filteredExpenses.filter(
    (e) => new Date(e.date + 'T12:00:00').getFullYear() === year,
  );

  const annualIncome = yearPayments.reduce((s, p) => s + p.amount, 0);
  const annualExpenses = yearExpenses.reduce((s, e) => s + e.amount, 0);
  const annualMortgage = yearExpenses
    .filter((e) => e.category === 'mortgage')
    .reduce((s, e) => s + e.amount, 0);

  const operatingExpenses = annualExpenses - annualMortgage;
  const noi = annualIncome - operatingExpenses;

  const relevantProperties = propertyId
    ? properties.filter((p) => p.id === propertyId)
    : properties;
  const totalPurchasePrice = relevantProperties.reduce(
    (s, p) => s + (p.purchasePrice ?? 0),
    0,
  );
  const allHavePrice =
    relevantProperties.length > 0 &&
    relevantProperties.every((p) => p.purchasePrice && p.purchasePrice > 0);

  const capRate = allHavePrice && totalPurchasePrice > 0 ? (noi / totalPurchasePrice) * 100 : null;
  const cashOnCash =
    allHavePrice && totalPurchasePrice > 0
      ? ((noi - annualMortgage) / totalPurchasePrice) * 100
      : null;
  const expenseRatio = annualIncome > 0 ? (annualExpenses / annualIncome) * 100 : null;
  const grm =
    allHavePrice && annualIncome > 0 ? totalPurchasePrice / annualIncome : null;

  const relevantUnits = propertyId
    ? units.filter((u) => u.propertyId === propertyId)
    : units;
  const relevantTenants = propertyId
    ? tenants.filter((t) => t.propertyId === propertyId)
    : tenants;
  const occupiedUnitIds = new Set(relevantTenants.map((t) => t.unitId));
  const monthlyVacancyLoss = relevantUnits
    .filter((u) => !occupiedUnitIds.has(u.id))
    .reduce((s, u) => s + u.monthlyRent, 0);

  return {
    annualIncome,
    annualExpenses,
    annualMortgage,
    noi,
    capRate,
    cashOnCash,
    expenseRatio,
    grm,
    monthlyVacancyLoss,
    annualVacancyLoss: monthlyVacancyLoss * 12,
  };
}

// ─── Tenant Reliability ──────────────────────────────────────────────────────

export type ReliabilityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface TenantReliability {
  score: number;
  grade: ReliabilityGrade;
  label: string;
  onTimeRate: number;
  consistencyScore: number;
  tenureMonths: number;
  latePayments: number;
  totalPayments: number;
}

const GRADE_MAP: { min: number; grade: ReliabilityGrade; label: string }[] = [
  { min: 90, grade: 'A', label: 'Excellent' },
  { min: 75, grade: 'B', label: 'Good' },
  { min: 60, grade: 'C', label: 'Fair' },
  { min: 40, grade: 'D', label: 'At Risk' },
  { min: 0, grade: 'F', label: 'Poor' },
];

export function getTenantReliability(
  tenant: Tenant,
  payments: Payment[],
  gracePeriodDays: number,
): TenantReliability {
  const tenantPayments = payments.filter((p) => p.tenantId === tenant.id);
  const totalPayments = tenantPayments.length;

  if (totalPayments === 0) {
    const leaseStart = new Date(tenant.leaseStart + 'T12:00:00');
    const tenure = Math.max(
      0,
      Math.floor((Date.now() - leaseStart.getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
    );
    return {
      score: 50,
      grade: 'C',
      label: 'New Tenant',
      onTimeRate: 0,
      consistencyScore: 0,
      tenureMonths: tenure,
      latePayments: 0,
      totalPayments: 0,
    };
  }

  const days = tenantPayments.map((p) => parseInt(p.date.split('-')[2], 10));
  const onTimeCount = days.filter((d) => d <= gracePeriodDays).length;
  const onTimeRate = onTimeCount / totalPayments;

  const latePayments = tenantPayments.filter((p) => (p.lateFee ?? 0) > 0).length;

  const mean = days.reduce((s, d) => s + d, 0) / days.length;
  const variance = days.reduce((s, d) => s + (d - mean) ** 2, 0) / days.length;
  const stdDev = Math.sqrt(variance);
  const consistencyScore = Math.max(0, 100 - stdDev * 10);

  const leaseStart = new Date(tenant.leaseStart + 'T12:00:00');
  const tenureMonths = Math.max(
    0,
    Math.floor((Date.now() - leaseStart.getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
  );
  const tenureScore = Math.min(100, tenureMonths * 4);

  const latePenalty = totalPayments > 0 ? (latePayments / totalPayments) * 30 : 0;

  const raw =
    onTimeRate * 40 +
    (consistencyScore / 100) * 25 +
    (tenureScore / 100) * 20 +
    15 -
    latePenalty;
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  const { grade, label } = GRADE_MAP.find((g) => score >= g.min) ?? GRADE_MAP[GRADE_MAP.length - 1];

  return {
    score,
    grade,
    label,
    onTimeRate: Math.round(onTimeRate * 100),
    consistencyScore: Math.round(consistencyScore),
    tenureMonths,
    latePayments,
    totalPayments,
  };
}

// ─── Year-over-Year Trends ───────────────────────────────────────────────────

export interface YoYTrend {
  year: number;
  income: number;
  expenses: number;
  noi: number;
  incomeGrowth: number | null;
  expenseGrowth: number | null;
  noiGrowth: number | null;
}

export function getYoYTrends(
  payments: Payment[],
  expenses: Expense[],
): YoYTrend[] {
  const yearSet = new Set<number>();
  for (const p of payments) {
    const y = Number(p.date.slice(0, 4));
    if (Number.isFinite(y)) yearSet.add(y);
  }
  for (const e of expenses) {
    const y = Number(e.date.slice(0, 4));
    if (Number.isFinite(y)) yearSet.add(y);
  }

  const years = [...yearSet].sort((a, b) => a - b);
  if (years.length === 0) return [];

  const trends: YoYTrend[] = [];
  for (let i = 0; i < years.length; i++) {
    const y = years[i];
    const income = payments
      .filter((p) => Number(p.date.slice(0, 4)) === y)
      .reduce((s, p) => s + p.amount, 0);
    const totalExp = expenses
      .filter((e) => Number(e.date.slice(0, 4)) === y)
      .reduce((s, e) => s + e.amount, 0);
    const mortgage = expenses
      .filter((e) => Number(e.date.slice(0, 4)) === y && e.category === 'mortgage')
      .reduce((s, e) => s + e.amount, 0);
    const noi = income - (totalExp - mortgage);

    const prev = i > 0 ? trends[i - 1] : null;
    const pctChange = (curr: number, prevVal: number | undefined) =>
      prevVal != null && prevVal > 0 ? ((curr - prevVal) / prevVal) * 100 : null;

    trends.push({
      year: y,
      income,
      expenses: totalExp,
      noi,
      incomeGrowth: prev ? pctChange(income, prev.income) : null,
      expenseGrowth: prev ? pctChange(totalExp, prev.expenses) : null,
      noiGrowth: prev && prev.noi > 0 ? pctChange(noi, prev.noi) : null,
    });
  }

  return trends;
}

// ─── Property Comparison ─────────────────────────────────────────────────────

export interface PropertyComparisonItem {
  property: Property;
  noi: number;
  capRate: number | null;
  expenseRatio: number | null;
  occupancyRate: number;
  collectionRate: number;
  vacancyLoss: number;
}

export function getPropertyComparison(
  properties: Property[],
  units: Unit[],
  tenants: Tenant[],
  expenses: Expense[],
  payments: Payment[],
  year: number,
): PropertyComparisonItem[] {
  return properties.map((property) => {
    const metrics = getInvestmentMetrics(
      properties,
      units,
      tenants,
      expenses,
      payments,
      year,
      property.id,
    );
    const propUnits = units.filter((u) => u.propertyId === property.id);
    const propTenants = tenants.filter((t) => t.propertyId === property.id);
    const occupancyRate =
      propUnits.length > 0 ? (propTenants.length / propUnits.length) * 100 : 0;
    const expectedAnnual = propTenants.reduce((s, t) => s + t.monthlyRent, 0) * 12;
    const collectionRate =
      expectedAnnual > 0 ? (metrics.annualIncome / expectedAnnual) * 100 : 0;

    return {
      property,
      noi: metrics.noi,
      capRate: metrics.capRate,
      expenseRatio: metrics.expenseRatio,
      occupancyRate,
      collectionRate,
      vacancyLoss: metrics.annualVacancyLoss,
    };
  });
}

// ─── Forecasting ─────────────────────────────────────────────────────────────

export interface Forecast {
  projectedMonthlyIncome: number;
  projectedMonthlyExpenses: number;
  projectedMonthlyNOI: number;
  projectedAnnualNOI: number;
  leaseExpirationRisk: { tenant: Tenant; monthlyRent: number; daysLeft: number }[];
  rentAtRisk: number;
  actualVsProjectedIncome: number | null;
}

export function getForecast(
  tenants: Tenant[],
  expenses: Expense[],
  payments: Payment[],
): Forecast {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const monthlyIncomes: number[] = [];
  const monthlyExpenses: number[] = [];
  for (let i = 6; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyIncomes.push(
      payments.filter((p) => p.date.startsWith(prefix)).reduce((s, p) => s + p.amount, 0),
    );
    monthlyExpenses.push(
      expenses.filter((e) => e.date.startsWith(prefix)).reduce((s, e) => s + e.amount, 0),
    );
  }

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const projectedMonthlyIncome = avg(monthlyIncomes);
  const projectedMonthlyExpenses = avg(monthlyExpenses);
  const projectedMonthlyNOI = projectedMonthlyIncome - projectedMonthlyExpenses;
  const projectedAnnualNOI = projectedMonthlyNOI * 12;

  const cutoff90 = new Date(todayStart);
  cutoff90.setDate(cutoff90.getDate() + 90);
  const leaseExpirationRisk = tenants
    .filter((t) => {
      const end = new Date(t.leaseEnd + 'T12:00:00');
      if (Number.isNaN(end.getTime())) return false;
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      return endDay >= todayStart && endDay <= cutoff90;
    })
    .map((t) => {
      const end = new Date(t.leaseEnd + 'T12:00:00');
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      const daysLeft = Math.ceil(
        (endDay.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
      );
      return { tenant: t, monthlyRent: t.monthlyRent, daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const rentAtRisk = leaseExpirationRisk.reduce((s, r) => s + r.monthlyRent, 0);

  const currentPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const actualThisMonth = payments
    .filter((p) => p.date.startsWith(currentPrefix))
    .reduce((s, p) => s + p.amount, 0);
  const actualVsProjectedIncome =
    projectedMonthlyIncome > 0
      ? ((actualThisMonth - projectedMonthlyIncome) / projectedMonthlyIncome) * 100
      : null;

  return {
    projectedMonthlyIncome,
    projectedMonthlyExpenses,
    projectedMonthlyNOI,
    projectedAnnualNOI,
    leaseExpirationRisk,
    rentAtRisk,
    actualVsProjectedIncome,
  };
}

// Leases ending within the next N days (compare by calendar date, not time of day)
export function getLeasesEndingSoon(
  tenants: Tenant[],
  withinDays: number
): { tenant: Tenant; daysLeft: number }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const cutoffStart = new Date(todayStart)
  cutoffStart.setDate(cutoffStart.getDate() + withinDays)
  return tenants
    .filter((t) => {
      const end = new Date(t.leaseEnd + 'T12:00:00')
      if (Number.isNaN(end.getTime())) return false
      const endStart = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      return endStart >= todayStart && endStart <= cutoffStart
    })
    .map((t) => {
      const end = new Date(t.leaseEnd + 'T12:00:00')
      const endStart = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      const daysLeft = Math.ceil((endStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24))
      return { tenant: t, daysLeft }
    })
    .sort((a, b) => a.tenant.leaseEnd.localeCompare(b.tenant.leaseEnd))
}
