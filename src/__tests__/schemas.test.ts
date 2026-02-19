import { describe, it, expect } from 'vitest'
import {
  propertySchema,
  tenantSchema,
  expenseSchema,
  paymentSchema,
  vendorSchema,
  maintenanceSchema,
  backupSchema,
  extractErrors,
} from '../lib/schemas'

describe('propertySchema', () => {
  const valid = { name: 'Oak St', address: '123 Oak', city: 'Austin', state: 'TX', zip: '78701' }

  it('accepts valid property', () => {
    expect(propertySchema.safeParse(valid).success).toBe(true)
  })
  it('rejects missing name', () => {
    const result = propertySchema.safeParse({ ...valid, name: '' })
    expect(result.success).toBe(false)
  })
  it('rejects invalid ZIP', () => {
    const result = propertySchema.safeParse({ ...valid, zip: '123' })
    expect(result.success).toBe(false)
  })
  it('accepts ZIP+4', () => {
    expect(propertySchema.safeParse({ ...valid, zip: '78701-1234' }).success).toBe(true)
  })
  it('accepts optional fields', () => {
    expect(propertySchema.safeParse({ ...valid, sqft: 2400, purchasePrice: 350000, notes: 'Nice place' }).success).toBe(true)
  })
})

describe('tenantSchema', () => {
  const valid = { unitId: 'u1', propertyId: 'p1', name: 'Jane', leaseStart: '2025-01-01', leaseEnd: '2026-01-01', monthlyRent: 1200 }

  it('accepts valid tenant', () => {
    expect(tenantSchema.safeParse(valid).success).toBe(true)
  })
  it('rejects lease end before start', () => {
    const result = tenantSchema.safeParse({ ...valid, leaseEnd: '2024-01-01' })
    expect(result.success).toBe(false)
  })
  it('accepts empty email and phone', () => {
    expect(tenantSchema.safeParse({ ...valid, email: '', phone: '' }).success).toBe(true)
  })
  it('rejects invalid email', () => {
    const result = tenantSchema.safeParse({ ...valid, email: 'notanemail' })
    expect(result.success).toBe(false)
  })
  it('rejects invalid phone format', () => {
    const result = tenantSchema.safeParse({ ...valid, phone: '1234567890' })
    expect(result.success).toBe(false)
  })
  it('accepts properly formatted phone', () => {
    expect(tenantSchema.safeParse({ ...valid, phone: '(555) 123-4567' }).success).toBe(true)
  })
})

describe('expenseSchema', () => {
  it('rejects zero amount', () => {
    const result = expenseSchema.safeParse({ propertyId: 'p1', category: 'maintenance', amount: 0, date: '2025-01-01', description: 'Fix' })
    expect(result.success).toBe(false)
  })
  it('accepts valid expense', () => {
    expect(expenseSchema.safeParse({ propertyId: 'p1', category: 'maintenance', amount: 100, date: '2025-01-01', description: 'Fix' }).success).toBe(true)
  })
})

describe('paymentSchema', () => {
  it('rejects zero amount', () => {
    const result = paymentSchema.safeParse({ tenantId: 't1', unitId: 'u1', propertyId: 'p1', amount: 0, date: '2025-01-01', periodStart: '2025-01-01', periodEnd: '2025-01-31' })
    expect(result.success).toBe(false)
  })
})

describe('vendorSchema', () => {
  it('accepts valid vendor', () => {
    expect(vendorSchema.safeParse({ name: 'Mike Plumbing' }).success).toBe(true)
  })
  it('rejects empty name', () => {
    expect(vendorSchema.safeParse({ name: '' }).success).toBe(false)
  })
})

describe('maintenanceSchema', () => {
  const valid = { propertyId: 'p1', title: 'Fix sink', description: 'Kitchen sink leaks', priority: 'medium' as const, status: 'open' as const, category: 'plumbing' as const }
  it('accepts valid request', () => {
    expect(maintenanceSchema.safeParse(valid).success).toBe(true)
  })
  it('rejects invalid priority', () => {
    expect(maintenanceSchema.safeParse({ ...valid, priority: 'urgent' }).success).toBe(false)
  })
})

describe('backupSchema', () => {
  it('accepts valid backup', () => {
    const data = {
      properties: [{ id: 'p1', name: 'Test' }],
      units: [{ id: 'u1' }],
      tenants: [],
      expenses: [],
      payments: [],
      maintenanceRequests: [],
      activityLogs: [],
      vendors: [],
      communicationLogs: [],
    }
    expect(backupSchema.safeParse(data).success).toBe(true)
  })
  it('rejects items without id', () => {
    const data = {
      properties: [{ name: 'no id' }],
      units: [],
      tenants: [],
      expenses: [],
      payments: [],
      maintenanceRequests: [],
      activityLogs: [],
      vendors: [],
      communicationLogs: [],
    }
    expect(backupSchema.safeParse(data).success).toBe(false)
  })
  it('defaults missing arrays to empty', () => {
    const result = backupSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.properties).toEqual([])
    }
  })
})

describe('extractErrors', () => {
  it('extracts field-level errors', () => {
    const result = propertySchema.safeParse({ name: '', address: '', city: '', state: '', zip: '123' })
    if (!result.success) {
      const errors = extractErrors(result.error)
      expect(errors.name).toBeDefined()
      expect(errors.zip).toBeDefined()
    }
  })
})
