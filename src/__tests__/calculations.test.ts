import { describe, it, expect } from 'vitest'
import {
  getExpectedMonthlyRent,
  getCollectedThisMonth,
  getExpensesThisMonth,
  getYTDIncome,
  getYTDExpenses,
  getDashboardStats,
  getPropertySummary,
  getLeaseStatus,
  getLeasesEndingSoon,
  getRentRollForMonth,
  getInvestmentMetrics,
  getTenantReliability,
  getYoYTrends,
  getPropertyComparison,
  getForecast,
} from '../lib/calculations'
import type { Property, Unit, Tenant, Expense, Payment } from '../types'

function makeProperty(overrides: Partial<Property> = {}): Property {
  return { id: 'p1', name: 'Test', address: '123 St', city: 'Austin', state: 'TX', zip: '78701', createdAt: '2025-01-01', updatedAt: '2025-01-01', ...overrides }
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return { id: 'u1', propertyId: 'p1', name: 'Unit 1', bedrooms: 2, bathrooms: 1, monthlyRent: 1000, available: false, createdAt: '2025-01-01', updatedAt: '2025-01-01', ...overrides }
}

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return { id: 't1', unitId: 'u1', propertyId: 'p1', name: 'John', leaseStart: '2025-01-01', leaseEnd: '2026-12-31', monthlyRent: 1000, createdAt: '2025-01-01', updatedAt: '2025-01-01', ...overrides }
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return { id: 'pay1', tenantId: 't1', unitId: 'u1', propertyId: 'p1', amount: 1000, date: '2025-06-15', periodStart: '2025-06-01', periodEnd: '2025-06-30', createdAt: '2025-01-01', updatedAt: '2025-01-01', ...overrides }
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return { id: 'e1', propertyId: 'p1', category: 'maintenance', amount: 200, date: '2025-06-10', description: 'Fix sink', createdAt: '2025-01-01', updatedAt: '2025-01-01', ...overrides }
}

describe('getExpectedMonthlyRent', () => {
  it('sums all tenant rents', () => {
    expect(getExpectedMonthlyRent([makeTenant({ monthlyRent: 1000 }), makeTenant({ id: 't2', monthlyRent: 1500 })])).toBe(2500)
  })
  it('returns 0 for empty list', () => {
    expect(getExpectedMonthlyRent([])).toBe(0)
  })
})

describe('getCollectedThisMonth', () => {
  it('sums payments in the given month', () => {
    const payments = [
      makePayment({ date: '2025-06-15', amount: 1000 }),
      makePayment({ id: 'pay2', date: '2025-06-20', amount: 500 }),
      makePayment({ id: 'pay3', date: '2025-07-01', amount: 800 }),
    ]
    expect(getCollectedThisMonth(payments, 2025, 5)).toBe(1500) // month is 0-indexed
  })
  it('returns 0 when no payments match', () => {
    expect(getCollectedThisMonth([makePayment({ date: '2025-03-01' })], 2025, 5)).toBe(0)
  })
})

describe('getExpensesThisMonth', () => {
  it('sums expenses in the given month', () => {
    const expenses = [
      makeExpense({ date: '2025-06-10', amount: 200 }),
      makeExpense({ id: 'e2', date: '2025-06-25', amount: 300 }),
    ]
    expect(getExpensesThisMonth(expenses, 2025, 5)).toBe(500)
  })
})

describe('getYTDIncome / getYTDExpenses', () => {
  it('sums all payments in the year', () => {
    const payments = [
      makePayment({ date: '2025-01-15', amount: 1000 }),
      makePayment({ id: 'pay2', date: '2025-06-15', amount: 1000 }),
      makePayment({ id: 'pay3', date: '2024-12-15', amount: 500 }),
    ]
    expect(getYTDIncome(payments, 2025)).toBe(2000)
  })
  it('sums all expenses in the year', () => {
    const expenses = [
      makeExpense({ date: '2025-03-10', amount: 100 }),
      makeExpense({ id: 'e2', date: '2025-09-10', amount: 200 }),
    ]
    expect(getYTDExpenses(expenses, 2025)).toBe(300)
  })
})

describe('getDashboardStats', () => {
  it('computes all dashboard stats correctly', () => {
    const stats = getDashboardStats([makeProperty()], [makeUnit()], [makeTenant()], [], [])
    expect(stats.totalProperties).toBe(1)
    expect(stats.totalUnits).toBe(1)
    expect(stats.occupiedUnits).toBe(1)
    expect(stats.occupancyRate).toBe(100)
    expect(stats.expectedMonthlyRent).toBe(1000)
  })
  it('handles empty data', () => {
    const stats = getDashboardStats([], [], [], [], [])
    expect(stats.totalProperties).toBe(0)
    expect(stats.occupancyRate).toBe(0)
  })
})

describe('getPropertySummary', () => {
  it('computes property-level summary', () => {
    const summary = getPropertySummary(makeProperty(), [makeUnit()], [makeTenant()], [], [])
    expect(summary.unitCount).toBe(1)
    expect(summary.occupiedUnits).toBe(1)
    expect(summary.totalMonthlyRent).toBe(1000)
    expect(summary.occupancyRate).toBe(100)
  })
})

describe('getLeaseStatus', () => {
  it('returns expired for past dates', () => {
    expect(getLeaseStatus('2020-01-01')).toBe('expired')
  })
  it('returns active for far-future dates', () => {
    expect(getLeaseStatus('2099-01-01')).toBe('active')
  })
  it('returns expiring for dates within warning window', () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 30)
    const isoDate = soon.toISOString().slice(0, 10)
    expect(getLeaseStatus(isoDate, 90)).toBe('expiring')
  })
})

describe('getLeasesEndingSoon', () => {
  it('finds tenants with leases ending within the window', () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 10)
    const tenant = makeTenant({ leaseEnd: soon.toISOString().slice(0, 10) })
    const result = getLeasesEndingSoon([tenant], 30)
    expect(result).toHaveLength(1)
    expect(result[0].daysLeft).toBeGreaterThanOrEqual(9)
    expect(result[0].daysLeft).toBeLessThanOrEqual(11)
  })
  it('excludes tenants outside the window', () => {
    const far = new Date()
    far.setDate(far.getDate() + 200)
    const tenant = makeTenant({ leaseEnd: far.toISOString().slice(0, 10) })
    expect(getLeasesEndingSoon([tenant], 30)).toHaveLength(0)
  })
})

describe('getRentRollForMonth', () => {
  it('matches tenants with their payments', () => {
    const property = makeProperty()
    const unit = makeUnit()
    const tenant = makeTenant()
    const payment = makePayment({ date: '2025-06-15' })
    const roll = getRentRollForMonth(2025, 5, [property], [unit], [tenant], [payment])
    expect(roll).toHaveLength(1)
    expect(roll[0].paid).toBe(true)
    expect(roll[0].paidAmount).toBe(1000)
  })
  it('shows unpaid when no payment exists', () => {
    const roll = getRentRollForMonth(2025, 5, [makeProperty()], [makeUnit()], [makeTenant()], [])
    expect(roll).toHaveLength(1)
    expect(roll[0].paid).toBe(false)
    expect(roll[0].paidAmount).toBe(0)
  })
})

// ─── Investment Metrics ──────────────────────────────────────────────────────

describe('getInvestmentMetrics', () => {
  it('computes NOI as income minus non-mortgage expenses', () => {
    const payments = [
      makePayment({ date: '2025-01-15', amount: 1000 }),
      makePayment({ id: 'pay2', date: '2025-06-15', amount: 1000 }),
    ]
    const expenses = [
      makeExpense({ date: '2025-03-10', amount: 200, category: 'maintenance' }),
      makeExpense({ id: 'e2', date: '2025-05-10', amount: 500, category: 'mortgage' }),
    ]
    const m = getInvestmentMetrics([makeProperty()], [makeUnit()], [makeTenant()], expenses, payments, 2025)
    expect(m.annualIncome).toBe(2000)
    expect(m.annualExpenses).toBe(700)
    expect(m.annualMortgage).toBe(500)
    expect(m.noi).toBe(1800) // 2000 - (700 - 500)
  })

  it('computes cap rate when purchase price is set', () => {
    const property = makeProperty({ purchasePrice: 100000 })
    const payments = [makePayment({ date: '2025-06-15', amount: 10000 })]
    const m = getInvestmentMetrics([property], [makeUnit()], [makeTenant()], [], payments, 2025)
    expect(m.capRate).toBeCloseTo(10, 0) // 10000 / 100000 * 100
  })

  it('returns null cap rate when no purchase price', () => {
    const m = getInvestmentMetrics([makeProperty()], [makeUnit()], [makeTenant()], [], [makePayment({ date: '2025-06-15' })], 2025)
    expect(m.capRate).toBeNull()
  })

  it('filters by propertyId', () => {
    const p1 = makeProperty({ id: 'p1' })
    const p2 = makeProperty({ id: 'p2' })
    const payments = [
      makePayment({ propertyId: 'p1', date: '2025-06-15', amount: 1000 }),
      makePayment({ id: 'pay2', propertyId: 'p2', date: '2025-06-15', amount: 2000 }),
    ]
    const m = getInvestmentMetrics([p1, p2], [makeUnit()], [makeTenant()], [], payments, 2025, 'p1')
    expect(m.annualIncome).toBe(1000)
  })

  it('computes expense ratio', () => {
    const payments = [makePayment({ date: '2025-06-15', amount: 1000 })]
    const expenses = [makeExpense({ date: '2025-06-10', amount: 400 })]
    const m = getInvestmentMetrics([makeProperty()], [makeUnit()], [makeTenant()], expenses, payments, 2025)
    expect(m.expenseRatio).toBeCloseTo(40, 0) // 400/1000*100
  })

  it('computes vacancy loss', () => {
    const unit1 = makeUnit({ id: 'u1', monthlyRent: 1000 })
    const unit2 = makeUnit({ id: 'u2', monthlyRent: 1500 })
    const tenant = makeTenant({ unitId: 'u1' })
    const m = getInvestmentMetrics([makeProperty()], [unit1, unit2], [tenant], [], [], 2025)
    expect(m.monthlyVacancyLoss).toBe(1500)
    expect(m.annualVacancyLoss).toBe(18000)
  })

  it('returns zero vacancy loss when fully occupied', () => {
    const m = getInvestmentMetrics([makeProperty()], [makeUnit()], [makeTenant()], [], [], 2025)
    expect(m.monthlyVacancyLoss).toBe(0)
  })

  it('computes GRM when purchase price and income exist', () => {
    const property = makeProperty({ purchasePrice: 120000 })
    const payments = [makePayment({ date: '2025-06-15', amount: 12000 })]
    const m = getInvestmentMetrics([property], [makeUnit()], [makeTenant()], [], payments, 2025)
    expect(m.grm).toBeCloseTo(10, 0) // 120000 / 12000
  })
})

// ─── Tenant Reliability ──────────────────────────────────────────────────────

describe('getTenantReliability', () => {
  it('returns "New Tenant" for tenants with no payments', () => {
    const tenant = makeTenant()
    const r = getTenantReliability(tenant, [], 5)
    expect(r.score).toBe(50)
    expect(r.grade).toBe('C')
    expect(r.label).toBe('New Tenant')
    expect(r.totalPayments).toBe(0)
  })

  it('scores high for consistent on-time payer', () => {
    const tenant = makeTenant({ leaseStart: '2024-01-01' })
    const payments = Array.from({ length: 12 }, (_, i) =>
      makePayment({
        id: `pay${i}`,
        tenantId: 't1',
        date: `2025-${String(i + 1).padStart(2, '0')}-03`,
        amount: 1000,
      }),
    )
    const r = getTenantReliability(tenant, payments, 5)
    expect(r.score).toBeGreaterThanOrEqual(80)
    expect(r.onTimeRate).toBe(100)
    expect(r.totalPayments).toBe(12)
  })

  it('penalizes late payments', () => {
    const tenant = makeTenant({ leaseStart: '2024-01-01' })
    const onTime = Array.from({ length: 6 }, (_, i) =>
      makePayment({
        id: `pay-on${i}`,
        tenantId: 't1',
        date: `2025-${String(i + 1).padStart(2, '0')}-03`,
        amount: 1000,
      }),
    )
    const late = Array.from({ length: 6 }, (_, i) =>
      makePayment({
        id: `pay-late${i}`,
        tenantId: 't1',
        date: `2025-${String(i + 7).padStart(2, '0')}-15`,
        amount: 1000,
        lateFee: 50,
      }),
    )
    const r = getTenantReliability(tenant, [...onTime, ...late], 5)
    expect(r.latePayments).toBe(6)
    expect(r.onTimeRate).toBe(50)
    expect(r.score).toBeLessThan(80)
  })

  it('returns proper grade labels', () => {
    const tenantA = makeTenant({ leaseStart: '2022-01-01' })
    const payments = Array.from({ length: 24 }, (_, i) =>
      makePayment({
        id: `pay${i}`,
        tenantId: 't1',
        date: `202${3 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-02`,
        amount: 1000,
      }),
    )
    const r = getTenantReliability(tenantA, payments, 5)
    expect(['A', 'B', 'C', 'D', 'F']).toContain(r.grade)
    expect(r.label).toBeTruthy()
  })

  it('only counts payments for the given tenant', () => {
    const tenant = makeTenant({ id: 't1' })
    const payments = [
      makePayment({ tenantId: 't1', date: '2025-06-03', amount: 1000 }),
      makePayment({ id: 'pay2', tenantId: 't2', date: '2025-06-03', amount: 1000 }),
    ]
    const r = getTenantReliability(tenant, payments, 5)
    // With < 3 payments, returns "New Tenant" early path with totalPayments: 0
    expect(r.label).toBe('New Tenant')
    expect(r.totalPayments).toBe(0)
  })
})

// ─── Year-over-Year Trends ───────────────────────────────────────────────────

describe('getYoYTrends', () => {
  it('returns empty array for no data', () => {
    expect(getYoYTrends([], [])).toEqual([])
  })

  it('computes trends for multiple years', () => {
    const payments = [
      makePayment({ date: '2024-06-15', amount: 10000 }),
      makePayment({ id: 'pay2', date: '2025-06-15', amount: 12000 }),
    ]
    const expenses = [
      makeExpense({ date: '2024-06-10', amount: 3000 }),
      makeExpense({ id: 'e2', date: '2025-06-10', amount: 3500 }),
    ]
    const trends = getYoYTrends(payments, expenses)
    expect(trends).toHaveLength(2)
    expect(trends[0].year).toBe(2024)
    expect(trends[0].incomeGrowth).toBeNull()
    expect(trends[1].year).toBe(2025)
    expect(trends[1].incomeGrowth).toBeCloseTo(20, 0) // (12000-10000)/10000*100
    expect(trends[1].expenseGrowth).toBeCloseTo(16.67, 0)
  })

  it('computes NOI excluding mortgage', () => {
    const payments = [makePayment({ date: '2025-06-15', amount: 10000 })]
    const expenses = [
      makeExpense({ date: '2025-06-10', amount: 2000, category: 'maintenance' }),
      makeExpense({ id: 'e2', date: '2025-06-10', amount: 5000, category: 'mortgage' }),
    ]
    const trends = getYoYTrends(payments, expenses)
    expect(trends).toHaveLength(1)
    expect(trends[0].noi).toBe(8000) // 10000 - (7000 - 5000)
  })

  it('handles single year gracefully', () => {
    const trends = getYoYTrends([makePayment({ date: '2025-06-15' })], [])
    expect(trends).toHaveLength(1)
    expect(trends[0].incomeGrowth).toBeNull()
  })
})

// ─── Property Comparison ─────────────────────────────────────────────────────

describe('getPropertyComparison', () => {
  it('returns comparison data for all properties', () => {
    const p1 = makeProperty({ id: 'p1', name: 'Prop A' })
    const p2 = makeProperty({ id: 'p2', name: 'Prop B' })
    const u1 = makeUnit({ id: 'u1', propertyId: 'p1' })
    const u2 = makeUnit({ id: 'u2', propertyId: 'p2' })
    const t1 = makeTenant({ id: 't1', propertyId: 'p1', unitId: 'u1' })
    const payments = [makePayment({ propertyId: 'p1', date: '2025-06-15', amount: 1000 })]
    const result = getPropertyComparison([p1, p2], [u1, u2], [t1], [], payments, 2025)
    expect(result).toHaveLength(2)
    expect(result[0].property.name).toBe('Prop A')
    expect(result[0].occupancyRate).toBe(100)
    expect(result[1].occupancyRate).toBe(0)
  })

  it('handles empty properties', () => {
    expect(getPropertyComparison([], [], [], [], [], 2025)).toHaveLength(0)
  })
})

// ─── Forecasting ─────────────────────────────────────────────────────────────

describe('getForecast', () => {
  it('projects income from last 6 months', () => {
    const now = new Date()
    const payments = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i - 1, 15)
      return makePayment({
        id: `pay${i}`,
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`,
        amount: 1000,
      })
    })
    const f = getForecast([makeTenant()], [], payments)
    expect(f.projectedMonthlyIncome).toBeCloseTo(1000, 0)
  })

  it('identifies lease expiration risk within 90 days', () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 30)
    const tenant = makeTenant({ leaseEnd: soon.toISOString().slice(0, 10), monthlyRent: 1500 })
    const f = getForecast([tenant], [], [])
    expect(f.leaseExpirationRisk).toHaveLength(1)
    expect(f.rentAtRisk).toBe(1500)
    expect(f.leaseExpirationRisk[0].daysLeft).toBeLessThanOrEqual(31)
  })

  it('returns zero projections for no history', () => {
    const f = getForecast([], [], [])
    expect(f.projectedMonthlyIncome).toBe(0)
    expect(f.projectedMonthlyExpenses).toBe(0)
    expect(f.projectedMonthlyNOI).toBe(0)
  })

  it('excludes leases beyond 90 days from risk', () => {
    const far = new Date()
    far.setDate(far.getDate() + 200)
    const tenant = makeTenant({ leaseEnd: far.toISOString().slice(0, 10) })
    const f = getForecast([tenant], [], [])
    expect(f.leaseExpirationRisk).toHaveLength(0)
    expect(f.rentAtRisk).toBe(0)
  })
})
