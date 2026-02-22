import { describe, it, expect } from 'vitest'
import { parseCSV, parseImportCSV } from '../lib/csvImport'
import type { Property, Unit, Tenant } from '../types'

function makeProperty(overrides: Partial<Property> = {}): Property {
  return { id: 'p1', name: 'Main House', address: '123 St', city: 'Austin', state: 'TX', zip: '78701', createdAt: '2025-01-01', updatedAt: '2025-01-01', ...overrides }
}
function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return { id: 'u1', propertyId: 'p1', name: 'Unit A', bedrooms: 2, bathrooms: 1, monthlyRent: 1000, available: true, createdAt: '2025-01-01', updatedAt: '2025-01-01', ...overrides }
}
function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return { id: 't1', unitId: 'u1', propertyId: 'p1', name: 'John Doe', leaseStart: '2025-01-01', leaseEnd: '2026-01-01', monthlyRent: 1000, createdAt: '2025-01-01', updatedAt: '2025-01-01', ...overrides }
}

describe('parseCSV', () => {
  it('parses simple CSV', () => {
    const rows = parseCSV('A,B\n1,2\n3,4')
    expect(rows).toEqual([['A', 'B'], ['1', '2'], ['3', '4']])
  })

  it('handles quoted values with commas', () => {
    const rows = parseCSV('Name,Addr\n"Smith, John","123 Main, Austin"')
    expect(rows[1]).toEqual(['Smith, John', '123 Main, Austin'])
  })

  it('handles escaped double quotes', () => {
    const rows = parseCSV('A\n"He said ""hello"""')
    expect(rows[1][0]).toBe('He said "hello"')
  })

  it('handles Windows line endings', () => {
    const rows = parseCSV('A,B\r\n1,2\r\n3,4')
    expect(rows.length).toBe(3)
  })

  it('filters empty rows', () => {
    const rows = parseCSV('A\n\nB\n\n')
    expect(rows).toEqual([['A'], ['B']])
  })
})

describe('parseImportCSV — properties', () => {
  it('parses valid property CSV', () => {
    const csv = 'Name,Address,City,State,ZIP\nOak House,456 Oak,Dallas,TX,75001'
    const result = parseImportCSV('properties', csv, [], [])
    expect(result.properties.length).toBe(1)
    expect(result.properties[0].name).toBe('Oak House')
    expect(result.errors.length).toBe(0)
  })

  it('rejects rows with missing required fields', () => {
    const csv = 'Name,Address\n,123 St'
    const result = parseImportCSV('properties', csv, [], [])
    expect(result.properties.length).toBe(0)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('Row 2')
  })
})

describe('parseImportCSV — expenses', () => {
  it('parses valid expense CSV', () => {
    const prop = makeProperty()
    const csv = 'Property,Date,Amount,Category,Description\nMain House,2025-06-15,500,maintenance,Fix roof'
    const result = parseImportCSV('expenses', csv, [prop], [])
    expect(result.expenses.length).toBe(1)
    expect(result.expenses[0].amount).toBe(500)
    expect(result.expenses[0].category).toBe('maintenance')
    expect(result.errors.length).toBe(0)
  })

  it('defaults unknown category to other', () => {
    const prop = makeProperty()
    const csv = 'Property,Date,Amount,Category,Description\nMain House,2025-06-15,100,unknown_cat,Misc'
    const result = parseImportCSV('expenses', csv, [prop], [])
    expect(result.expenses[0].category).toBe('other')
  })

  it('rejects invalid date format', () => {
    const prop = makeProperty()
    const csv = 'Property,Date,Amount,Category,Description\nMain House,June 15,100,other,Misc'
    const result = parseImportCSV('expenses', csv, [prop], [])
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('YYYY-MM-DD')
  })

  it('rejects unknown property', () => {
    const csv = 'Property,Date,Amount,Category,Description\nNo Such Place,2025-06-15,100,other,Misc'
    const result = parseImportCSV('expenses', csv, [], [])
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('not found')
  })
})

describe('parseImportCSV — payments', () => {
  it('parses valid payment CSV', () => {
    const prop = makeProperty()
    const unit = makeUnit()
    const tenant = makeTenant()
    const csv = 'Tenant,Date,Amount,Method\nJohn Doe,2025-06-15,1000,transfer'
    const result = parseImportCSV('payments', csv, [prop], [unit], [tenant])
    expect(result.payments.length).toBe(1)
    expect(result.payments[0].tenantId).toBe('t1')
    expect(result.payments[0].amount).toBe(1000)
    expect(result.payments[0].method).toBe('transfer')
  })

  it('auto-generates period dates from payment date', () => {
    const tenant = makeTenant()
    const csv = 'Tenant,Date,Amount\nJohn Doe,2025-03-10,1000'
    const result = parseImportCSV('payments', csv, [makeProperty()], [makeUnit()], [tenant])
    expect(result.payments[0].periodStart).toBe('2025-03-01')
    expect(result.payments[0].periodEnd).toBe('2025-03-31')
  })

  it('rejects unknown tenant', () => {
    const csv = 'Tenant,Date,Amount\nNobody,2025-06-15,1000'
    const result = parseImportCSV('payments', csv, [makeProperty()], [makeUnit()], [makeTenant()])
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('not found')
  })

  it('returns error for empty CSV', () => {
    const result = parseImportCSV('payments', 'Tenant', [], [], [])
    expect(result.errors[0]).toContain('empty')
  })
})
