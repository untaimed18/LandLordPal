import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockDbBatch = vi.fn().mockResolvedValue(true)
const mockDbSave = vi.fn().mockResolvedValue(true)
const mockDbLoad = vi.fn().mockResolvedValue(null)
const mockDocDeleteFile = vi.fn().mockResolvedValue(true)
const mockDocPickFile = vi.fn().mockResolvedValue(null)
const mockDocOpenFile = vi.fn().mockResolvedValue(true)

Object.defineProperty(window, 'electronAPI', {
  value: {
    platform: 'test',
    dbLoad: mockDbLoad,
    dbSave: mockDbSave,
    dbBatch: mockDbBatch,
    docPickFile: mockDocPickFile,
    docDeleteFile: mockDocDeleteFile,
    docOpenFile: mockDocOpenFile,
    onUpdateStatus: vi.fn(),
    startDownload: vi.fn(),
    installUpdate: vi.fn(),
    checkForUpdates: vi.fn(),
  },
  writable: true,
})

let store: typeof import('../store')

describe('store', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockDbBatch.mockClear()
    mockDbSave.mockClear()
    mockDbLoad.mockResolvedValue(null)
    mockDocDeleteFile.mockClear()

    store = await import('../store')
    await store.initStore()
  })

  describe('properties', () => {
    it('addProperty creates and returns a property with generated id', () => {
      const prop = store.addProperty({ name: 'Test', address: '123 Main', city: 'Austin', state: 'TX', zip: '78701' })
      expect(prop.id).toBeTruthy()
      expect(prop.name).toBe('Test')
      expect(prop.createdAt).toBeTruthy()
      expect(store.getState().properties).toHaveLength(1)
      expect(mockDbBatch).toHaveBeenCalled()
    })

    it('updateProperty modifies the property in state', () => {
      const prop = store.addProperty({ name: 'Test', address: '123 Main', city: 'Austin', state: 'TX', zip: '78701' })
      store.updateProperty(prop.id, { name: 'Updated' })
      const updated = store.getState().properties.find((p) => p.id === prop.id)
      expect(updated?.name).toBe('Updated')
    })

    it('deleteProperty removes the property and cascades', () => {
      const prop = store.addProperty({ name: 'Test', address: '123 Main', city: 'Austin', state: 'TX', zip: '78701' })
      const unit = store.addUnit({ propertyId: prop.id, name: 'Unit 1', bedrooms: 1, bathrooms: 1, monthlyRent: 1000, available: true })
      store.addTenant({ propertyId: prop.id, unitId: unit.id, name: 'John', leaseStart: '2025-01-01', leaseEnd: '2026-01-01', monthlyRent: 1000 })

      store.deleteProperty(prop.id)
      const s = store.getState()
      expect(s.properties).toHaveLength(0)
      expect(s.units).toHaveLength(0)
      expect(s.tenants).toHaveLength(0)
    })
  })

  describe('units', () => {
    it('addUnit creates a unit', () => {
      const prop = store.addProperty({ name: 'Test', address: '123', city: 'A', state: 'TX', zip: '78701' })
      const unit = store.addUnit({ propertyId: prop.id, name: 'Unit 1', bedrooms: 2, bathrooms: 1, monthlyRent: 1200, available: true })
      expect(unit.id).toBeTruthy()
      expect(store.getState().units).toHaveLength(1)
    })

    it('deleteUnit clears unitId from expenses', () => {
      const prop = store.addProperty({ name: 'P', address: '1', city: 'A', state: 'TX', zip: '78701' })
      const unit = store.addUnit({ propertyId: prop.id, name: 'U1', bedrooms: 1, bathrooms: 1, monthlyRent: 1000, available: true })
      store.addExpense({ propertyId: prop.id, unitId: unit.id, category: 'repairs', amount: 100, date: '2025-01-15', description: 'Fix' })

      store.deleteUnit(unit.id)
      const expense = store.getState().expenses[0]
      expect(expense.unitId).toBeUndefined()
    })
  })

  describe('tenants', () => {
    it('addTenant creates a tenant', () => {
      const prop = store.addProperty({ name: 'P', address: '1', city: 'A', state: 'TX', zip: '78701' })
      const unit = store.addUnit({ propertyId: prop.id, name: 'U', bedrooms: 1, bathrooms: 1, monthlyRent: 1000, available: true })
      const tenant = store.addTenant({ propertyId: prop.id, unitId: unit.id, name: 'Alice', leaseStart: '2025-01-01', leaseEnd: '2026-01-01', monthlyRent: 1000 })
      expect(tenant.name).toBe('Alice')
      expect(store.getState().tenants).toHaveLength(1)
    })

    it('updateTenant tracks rent history on rent change', () => {
      const prop = store.addProperty({ name: 'P', address: '1', city: 'A', state: 'TX', zip: '78701' })
      const unit = store.addUnit({ propertyId: prop.id, name: 'U', bedrooms: 1, bathrooms: 1, monthlyRent: 1000, available: true })
      const tenant = store.addTenant({ propertyId: prop.id, unitId: unit.id, name: 'Alice', leaseStart: '2025-01-01', leaseEnd: '2026-01-01', monthlyRent: 1000 })
      store.updateTenant(tenant.id, { monthlyRent: 1200 })
      const updated = store.getState().tenants.find((t) => t.id === tenant.id)
      expect(updated?.rentHistory).toHaveLength(1)
      expect(updated?.rentHistory?.[0].oldRent).toBe(1000)
      expect(updated?.rentHistory?.[0].newRent).toBe(1200)
    })

    it('deleteTenant marks unit as available', () => {
      const prop = store.addProperty({ name: 'P', address: '1', city: 'A', state: 'TX', zip: '78701' })
      const unit = store.addUnit({ propertyId: prop.id, name: 'U', bedrooms: 1, bathrooms: 1, monthlyRent: 1000, available: false })
      const tenant = store.addTenant({ propertyId: prop.id, unitId: unit.id, name: 'Alice', leaseStart: '2025-01-01', leaseEnd: '2026-01-01', monthlyRent: 1000 })
      store.deleteTenant(tenant.id)
      const updatedUnit = store.getState().units.find((u) => u.id === unit.id)
      expect(updatedUnit?.available).toBe(true)
    })
  })

  describe('payments', () => {
    it('addPayment creates a payment', () => {
      const payment = store.addPayment({ tenantId: 't1', unitId: 'u1', propertyId: 'p1', amount: 1000, date: '2025-01-01', periodStart: '2025-01-01', periodEnd: '2025-01-31' })
      expect(payment.amount).toBe(1000)
      expect(store.getState().payments).toHaveLength(1)
    })

    it('deletePayment removes it from state', () => {
      const payment = store.addPayment({ tenantId: 't1', unitId: 'u1', propertyId: 'p1', amount: 1000, date: '2025-01-01', periodStart: '2025-01-01', periodEnd: '2025-01-31' })
      store.deletePayment(payment.id)
      expect(store.getState().payments).toHaveLength(0)
    })
  })

  describe('vendors', () => {
    it('deleteVendor clears vendorId from related records', () => {
      const vendor = store.addVendor({ name: 'Joe Plumber' })
      const prop = store.addProperty({ name: 'P', address: '1', city: 'A', state: 'TX', zip: '78701' })
      store.addExpense({ propertyId: prop.id, category: 'repairs', amount: 200, date: '2025-01-15', description: 'Fix', vendorId: vendor.id })
      store.addMaintenanceRequest({ propertyId: prop.id, title: 'Leak', description: 'Kitchen', priority: 'medium', status: 'open', category: 'plumbing', vendorId: vendor.id })

      store.deleteVendor(vendor.id)
      expect(store.getState().vendors).toHaveLength(0)
      expect(store.getState().expenses[0].vendorId).toBeUndefined()
      expect(store.getState().maintenanceRequests[0].vendorId).toBeUndefined()
    })
  })

  describe('snapshot/restore', () => {
    it('restoreSnapshot reverts state', () => {
      const prop = store.addProperty({ name: 'Before', address: '1', city: 'A', state: 'TX', zip: '78701' })
      const snap = store.takeSnapshot()
      store.updateProperty(prop.id, { name: 'After' })
      expect(store.getState().properties[0].name).toBe('After')

      store.restoreSnapshot(snap)
      expect(store.getState().properties[0].name).toBe('Before')
    })
  })

  describe('importState', () => {
    it('replaces all state with parsed data', () => {
      store.addProperty({ name: 'Old', address: '1', city: 'A', state: 'TX', zip: '78701' })
      store.importState({
        properties: [{ id: 'new-1', name: 'New', address: '2', city: 'B', state: 'CA', zip: '90210', createdAt: '2025-01-01', updatedAt: '2025-01-01' }],
        units: [], tenants: [], expenses: [], payments: [],
        maintenanceRequests: [], activityLogs: [], vendors: [],
        communicationLogs: [], documents: [],
      })
      expect(store.getState().properties).toHaveLength(1)
      expect(store.getState().properties[0].name).toBe('New')
    })
  })

  describe('subscribe', () => {
    it('notifies listeners on state change', () => {
      const listener = vi.fn()
      const unsub = store.subscribe(listener)
      store.addVendor({ name: 'V1' })
      expect(listener).toHaveBeenCalled()
      unsub()
    })
  })
})
