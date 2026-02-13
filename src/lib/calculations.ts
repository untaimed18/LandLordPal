import type {
  Property,
  Unit,
  Tenant,
  Expense,
  Payment,
  DashboardStats,
  PropertySummary,
} from '../types';

const STORAGE_KEY = 'landlord-pal-data';

// Parse as local date (noon avoids DST edge cases) so month comparison is correct in all timezones
function isInMonth(dateStr: string, year: number, month: number): boolean {
  const d = new Date(dateStr + 'T12:00:00');
  return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
}

export function getExpectedMonthlyRent(_units: Unit[], tenants: Tenant[]): number {
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

  const expectedMonthlyRent = getExpectedMonthlyRent(units, tenants);
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

export { STORAGE_KEY };

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
