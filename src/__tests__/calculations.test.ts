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
