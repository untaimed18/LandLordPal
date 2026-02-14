import { useState, useEffect } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import {
  addUnit,
  updateUnit,
  deleteUnit,
  addTenant,
  updateTenant,
  deleteTenant,
  addPayment,
  deletePayment,
  updateProperty,
  deleteProperty,
  addActivityLog,
  deleteActivityLog,
  takeSnapshot,
  restoreSnapshot,
} from '../store'
import { getPropertySummary, getLeaseStatus } from '../lib/calculations'
import type { ExpenseCategory } from '../types'
import { useNavigate } from 'react-router-dom'
import { nowISO } from '../lib/id'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatMoney, formatDate, formatPhoneNumber } from '../lib/format'
import { US_STATES } from '../lib/us-states'
import Breadcrumbs from '../components/Breadcrumbs'
import type { PropertyType, CommunicationType } from '../types'
import { addCommunicationLog, deleteCommunicationLog } from '../store'
import { User, Phone, Mail, CalendarDays, DollarSign, Clock, ShieldCheck, BedDouble, CreditCard } from 'lucide-react'

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'single_family', label: 'Single Family' },
  { value: 'multi_family', label: 'Multi Family' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' },
]

const COMMON_AMENITIES = [
  'Parking', 'Garage', 'Pool', 'Laundry', 'Dishwasher', 'AC', 'Heating',
  'Balcony', 'Patio', 'Yard', 'Storage', 'Gym', 'Pet Friendly', 'Elevator',
]

const COMM_TYPES: { value: CommunicationType; label: string }[] = [
  { value: 'call', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'text', label: 'Text Message' },
  { value: 'in_person', label: 'In Person' },
  { value: 'letter', label: 'Letter' },
  { value: 'other', label: 'Other' },
]

const SINGLE_UNIT_TYPES: PropertyType[] = ['single_family', 'condo', 'townhouse']
function isSingleUnitProp(type?: string): boolean {
  return SINGLE_UNIT_TYPES.includes(type as PropertyType)
}

function formatNumberWithCommas(value: string): string {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

function startOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function endOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'management', label: 'Management' },
  { value: 'legal', label: 'Legal' },
  { value: 'other', label: 'Other' },
]

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { properties, units, tenants, expenses, payments, maintenanceRequests, activityLogs, communicationLogs } = useStore()
  const [paymentHistoryTenant, setPaymentHistoryTenant] = useState<string | null>(null)
  const [commForm, setCommForm] = useState<string | null>(null)
  const [newComm, setNewComm] = useState({ type: 'call' as CommunicationType, date: nowISO(), subject: '', notes: '' })
  const [unitForm, setUnitForm] = useState(false)
  const [tenantForm, setTenantForm] = useState<string | null>(null)
  const [paymentForm, setPaymentForm] = useState<string | null>(null)
  const [editingProperty, setEditingProperty] = useState(false)
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteEntity, setNoteEntity] = useState<{ type: 'property' | 'unit' | 'tenant'; id: string } | null>(null)
  const [showMoveOut, setShowMoveOut] = useState<string | null>(null)
  const [moveOutDate, setMoveOutDate] = useState(nowISO())
  const [moveOutNotes, setMoveOutNotes] = useState('')
  const [depositReturned, setDepositReturned] = useState(0)
  const [depositDeductions, setDepositDeductions] = useState('')

  const property = properties.find((p) => p.id === id)

  const [propertyForm, setPropertyForm] = useState({ name: '', address: '', city: '', state: '', zip: '', propertyType: '' as string, sqft: 0, amenities: [] as string[], notes: '', purchasePrice: 0, purchaseDate: '', insuranceProvider: '', insurancePolicyNumber: '', insuranceExpiry: '' })
  const [newUnit, setNewUnit] = useState({ name: '', bedrooms: 1, bathrooms: 1, monthlyRent: 0, sqft: 0, deposit: 0, notes: '', available: true })
  const [newTenant, setNewTenant] = useState({ unitId: '', name: '', email: '', phone: '', leaseStart: '', leaseEnd: '', monthlyRent: 0, deposit: 0, gracePeriodDays: 5, lateFeeAmount: 0, notes: '' })
  const [newPayment, setNewPayment] = useState({ tenantId: '', amount: 0, date: nowISO(), method: 'transfer' as const, notes: '' })

  useEffect(() => {
    if (id) {
      setUnitForm(false)
      setTenantForm(null)
      setPaymentForm(null)
      setEditingProperty(false)
      setEditingUnitId(null)
      setEditingTenantId(null)
      setNoteEntity(null)
      setShowMoveOut(null)
    }
  }, [id])

  // Auto-open tenant form when navigated with ?addTenant=1
  useEffect(() => {
    if (searchParams.get('addTenant') === '1' && id) {
      const propUnitsLocal = units.filter((u) => u.propertyId === id)
      const firstAvailable = propUnitsLocal.find((u) => !tenants.some((t) => t.unitId === u.id))
      if (firstAvailable) {
        setTenantForm(firstAvailable.id)
        setNewTenant({ unitId: firstAvailable.id, name: '', email: '', phone: '', leaseStart: '', leaseEnd: '', monthlyRent: firstAvailable.monthlyRent, deposit: firstAvailable.deposit ?? 0, gracePeriodDays: 5, lateFeeAmount: 0, notes: '' })
        setSearchParams({}, { replace: true })
      }
    }
  }, [searchParams, id, units, tenants, setSearchParams])

  if (!property) {
    return (
      <div className="page">
        <p>Property not found.</p>
        <Link to="/properties">Back to properties</Link>
      </div>
    )
  }

  const prop = property as NonNullable<typeof property>

  const propUnits = units.filter((u) => u.propertyId === prop.id)
  const propTenants = tenants.filter((t) => t.propertyId === prop.id)
  const propExpenses = expenses.filter((e) => e.propertyId === prop.id)
  const propPayments = payments.filter((p) => p.propertyId === prop.id)
  const propMaintenance = maintenanceRequests.filter((m) => m.propertyId === prop.id && m.status !== 'completed')
  const propLogs = activityLogs.filter((a) => {
    if (a.entityType === 'property' && a.entityId === prop.id) return true
    if (a.entityType === 'unit' && propUnits.some((u) => u.id === a.entityId)) return true
    if (a.entityType === 'tenant' && propTenants.some((t) => t.id === a.entityId)) return true
    return false
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const summary = getPropertySummary(prop, units, tenants, expenses, payments)

  function openEditProperty() {
    setPropertyForm({
      name: prop.name,
      address: prop.address,
      city: prop.city,
      state: prop.state,
      zip: prop.zip,
      propertyType: prop.propertyType ?? '',
      sqft: prop.sqft ?? 0,
      amenities: prop.amenities ?? [],
      notes: prop.notes ?? '',
      purchasePrice: prop.purchasePrice ?? 0,
      purchaseDate: prop.purchaseDate ?? '',
      insuranceProvider: prop.insuranceProvider ?? '',
      insurancePolicyNumber: prop.insurancePolicyNumber ?? '',
      insuranceExpiry: prop.insuranceExpiry ?? '',
    })
    setEditingProperty(true)
  }

  function saveProperty(e: React.FormEvent) {
    e.preventDefault()
    updateProperty(prop.id, {
      name: propertyForm.name,
      address: propertyForm.address,
      city: propertyForm.city,
      state: propertyForm.state,
      zip: propertyForm.zip,
      propertyType: (propertyForm.propertyType as PropertyType) || undefined,
      sqft: propertyForm.sqft || undefined,
      amenities: propertyForm.amenities.length > 0 ? propertyForm.amenities : undefined,
      purchasePrice: propertyForm.purchasePrice || undefined,
      purchaseDate: propertyForm.purchaseDate || undefined,
      insuranceProvider: propertyForm.insuranceProvider || undefined,
      insurancePolicyNumber: propertyForm.insurancePolicyNumber || undefined,
      insuranceExpiry: propertyForm.insuranceExpiry || undefined,
      notes: propertyForm.notes || undefined,
    })
    setEditingProperty(false)
    toast('Property updated')
  }

  async function handleDeleteProperty() {
    const ok = await confirm({
      title: 'Delete property',
      message: `Delete "${prop.name}"? This will remove all units, tenants, expenses, and payments for this property.`,
      confirmText: 'Delete',
      danger: true,
    })
    if (ok) {
      const snap = takeSnapshot()
      deleteProperty(prop.id)
      navigate('/properties')
      toast('Property deleted', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); navigate(`/properties/${prop.id}`); toast('Property restored', 'info') } } })
    }
  }

  async function handleDeleteUnit(unitId: string, unitName: string) {
    const tenant = propTenants.find((t) => t.unitId === unitId)
    if (tenant) {
      await confirm({ title: 'Cannot delete unit', message: 'Remove the tenant first before deleting the unit.', confirmText: 'OK' })
      return
    }
    const ok = await confirm({
      title: 'Delete unit',
      message: `Delete unit "${unitName}"?`,
      confirmText: 'Delete',
      danger: true,
    })
    if (ok) {
      const snap = takeSnapshot()
      deleteUnit(unitId)
      setEditingUnitId(null)
      toast('Unit deleted', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); toast('Unit restored', 'info') } } })
    }
  }

  async function handleDeleteTenant(tenantId: string, tenantName: string) {
    const ok = await confirm({
      title: 'Remove tenant',
      message: `Remove tenant "${tenantName}"? The unit will be marked available again.`,
      confirmText: 'Remove',
      danger: true,
    })
    if (ok) {
      const snap = takeSnapshot()
      deleteTenant(tenantId)
      setEditingTenantId(null)
      toast('Tenant removed', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); toast('Tenant restored', 'info') } } })
    }
  }

  async function handleDeletePaymentClick(paymentId: string) {
    const ok = await confirm({
      title: 'Delete payment',
      message: 'Delete this payment record?',
      confirmText: 'Delete',
      danger: true,
    })
    if (ok) {
      const snap = takeSnapshot()
      deletePayment(paymentId)
      toast('Payment deleted', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); toast('Payment restored', 'info') } } })
    }
  }

  function handleAddUnit(e: React.FormEvent) {
    e.preventDefault()
    addUnit({
      propertyId: prop.id,
      name: newUnit.name,
      bedrooms: newUnit.bedrooms,
      bathrooms: newUnit.bathrooms,
      monthlyRent: newUnit.monthlyRent,
      sqft: newUnit.sqft || undefined,
      deposit: newUnit.deposit || undefined,
      notes: newUnit.notes || undefined,
      available: newUnit.available,
    })
    setNewUnit({ name: '', bedrooms: 1, bathrooms: 1, monthlyRent: 0, sqft: 0, deposit: 0, notes: '', available: true })
    setUnitForm(false)
    toast('Unit added')
  }

  function handleAddTenant(e: React.FormEvent) {
    e.preventDefault()
    if (!newTenant.unitId) return
    if (newTenant.leaseEnd <= newTenant.leaseStart) {
      toast('Lease end date must be after start date', 'error')
      return
    }
    // Overlapping lease detection
    const overlapping = tenants.find(
      (t) => t.unitId === newTenant.unitId && t.id !== editingTenantId &&
        t.leaseStart <= newTenant.leaseEnd && t.leaseEnd >= newTenant.leaseStart
    )
    if (overlapping) {
      toast(`Lease overlaps with "${overlapping.name}" (${formatDate(overlapping.leaseStart)} – ${formatDate(overlapping.leaseEnd)})`, 'error')
      return
    }
    const unit = units.find((u) => u.id === newTenant.unitId)
    addTenant({
      propertyId: prop.id,
      unitId: newTenant.unitId,
      name: newTenant.name,
      email: newTenant.email || undefined,
      phone: newTenant.phone || undefined,
      leaseStart: newTenant.leaseStart,
      leaseEnd: newTenant.leaseEnd,
      monthlyRent: newTenant.monthlyRent,
      deposit: newTenant.deposit || undefined,
      gracePeriodDays: newTenant.gracePeriodDays || undefined,
      lateFeeAmount: newTenant.lateFeeAmount || undefined,
      notes: newTenant.notes || undefined,
      moveInDate: newTenant.leaseStart,
    })
    updateUnit(newTenant.unitId, { available: false })
    setNewTenant({ unitId: '', name: '', email: '', phone: '', leaseStart: '', leaseEnd: '', monthlyRent: unit?.monthlyRent ?? 0, deposit: unit?.deposit ?? 0, gracePeriodDays: 5, lateFeeAmount: 0, notes: '' })
    setTenantForm(null)
    toast('Tenant added')
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    const t = tenants.find((x) => x.id === newPayment.tenantId)
    if (!t) return
    const d = new Date(newPayment.date + 'T12:00:00')
    // Duplicate payment detection
    const payMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const existingPayment = payments.find(
      (p) => p.tenantId === t.id && p.date.startsWith(payMonth)
    )
    if (existingPayment) {
      const ok = await confirm({
        title: 'Possible duplicate',
        message: `A payment of ${formatMoney(existingPayment.amount)} was already recorded for ${t.name} in ${payMonth}. Record another payment anyway?`,
        confirmText: 'Record anyway',
      })
      if (!ok) return
    }
    addPayment({
      propertyId: prop.id,
      unitId: t.unitId,
      tenantId: t.id,
      amount: newPayment.amount,
      date: newPayment.date,
      periodStart: startOfMonth(d),
      periodEnd: endOfMonth(d),
      method: newPayment.method,
      notes: newPayment.notes || undefined,
    })
    setNewPayment({ ...newPayment, tenantId: '', amount: 0, notes: '' })
    setPaymentForm(null)
    toast('Payment recorded')
  }

  function handleAddNote() {
    if (!noteEntity || !noteText.trim()) return
    addActivityLog({
      entityType: noteEntity.type,
      entityId: noteEntity.id,
      note: noteText.trim(),
      date: nowISO(),
    })
    setNoteText('')
    setNoteEntity(null)
    toast('Note added')
  }

  function handleMoveOut(tenantId: string) {
    const t = tenants.find((x) => x.id === tenantId)
    if (!t) return
    addActivityLog({
      entityType: 'unit',
      entityId: t.unitId,
      note: `Tenant "${t.name}" moved out. Deposit returned: ${formatMoney(depositReturned)}${depositDeductions ? `. Deductions: ${depositDeductions}` : ''}${moveOutNotes ? `. Notes: ${moveOutNotes}` : ''}`,
      date: moveOutDate,
    })
    deleteTenant(tenantId)
    setShowMoveOut(null)
    toast('Tenant moved out and unit marked available')
  }

  return (
    <div className="page property-detail">
      <div className="page-header">
        <div>
          <Breadcrumbs items={[{ label: 'Properties', to: '/properties' }, { label: prop.name }]} />
          {!editingProperty ? (
            <>
              <h1>{prop.name}</h1>
              <p className="muted">
                {prop.address}, {prop.city}, {prop.state} {prop.zip}
                {prop.propertyType && <> · {PROPERTY_TYPES.find((t) => t.value === prop.propertyType)?.label}</>}
                {prop.sqft != null && prop.sqft > 0 && <> · {prop.sqft.toLocaleString()} sqft</>}
              </p>
              {prop.purchasePrice != null && prop.purchasePrice > 0 && (
                <p className="muted">Purchased for {formatMoney(prop.purchasePrice)}{prop.purchaseDate ? ` on ${formatDate(prop.purchaseDate)}` : ''}</p>
              )}
              {prop.amenities && prop.amenities.length > 0 && (
                <div className="amenity-chips" style={{ marginTop: '0.25rem' }}>
                  {prop.amenities.map((a) => <span key={a} className="amenity-chip active">{a}</span>)}
                </div>
              )}
              {prop.insuranceProvider && (
                <p className="muted" style={{ marginTop: '0.25rem' }}>
                  Insurance: {prop.insuranceProvider}
                  {prop.insurancePolicyNumber && <> (#{prop.insurancePolicyNumber})</>}
                  {prop.insuranceExpiry && <> · Expires {formatDate(prop.insuranceExpiry)}</>}
                </p>
              )}
              {prop.notes && <p className="property-notes">{prop.notes}</p>}
              <div className="header-actions">
                <button type="button" className="btn small" onClick={openEditProperty}>Edit property</button>
                <button type="button" className="btn small danger" onClick={handleDeleteProperty}>Delete property</button>
              </div>
            </>
          ) : (
            <form className="card form-card inline-form" onSubmit={saveProperty}>
              <h3>Edit property</h3>
              <div className="form-grid">
                <label>Name * <input required value={propertyForm.name} onChange={(e) => setPropertyForm((f) => ({ ...f, name: e.target.value }))} /></label>
                <label>Address * <input required value={propertyForm.address} onChange={(e) => setPropertyForm((f) => ({ ...f, address: e.target.value }))} /></label>
                <label>City * <input required value={propertyForm.city} onChange={(e) => setPropertyForm((f) => ({ ...f, city: e.target.value }))} /></label>
                <label>State * <select required value={propertyForm.state} onChange={(e) => setPropertyForm((f) => ({ ...f, state: e.target.value }))}>
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s.value} value={s.value}>{s.value} — {s.label}</option>)}
                </select></label>
                <label>ZIP * <input required pattern="\d{5}(-\d{4})?" title="5-digit ZIP or ZIP+4 (e.g. 78701 or 78701-1234)" value={propertyForm.zip} onChange={(e) => setPropertyForm((f) => ({ ...f, zip: e.target.value }))} /></label>
                <label>Property type <select value={propertyForm.propertyType} onChange={(e) => setPropertyForm((f) => ({ ...f, propertyType: e.target.value }))}>
                  <option value="">Select type</option>
                  {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select></label>
                <label>Total sq ft <input type="number" min={0} value={propertyForm.sqft || ''} onChange={(e) => setPropertyForm((f) => ({ ...f, sqft: +e.target.value || 0 }))} /></label>
                <label>Purchase price <input type="text" inputMode="numeric" value={propertyForm.purchasePrice ? formatNumberWithCommas(String(propertyForm.purchasePrice)) : ''} onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ''); setPropertyForm((f) => ({ ...f, purchasePrice: raw ? Number(raw) : 0 })) }} /></label>
                <label>Purchase date <input type="date" value={propertyForm.purchaseDate} onChange={(e) => setPropertyForm((f) => ({ ...f, purchaseDate: e.target.value }))} /></label>
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <label>Amenities</label>
                <div className="amenity-chips">
                  {COMMON_AMENITIES.map((a) => (
                    <button key={a} type="button" className={`amenity-chip ${propertyForm.amenities.includes(a) ? 'active' : ''}`}
                      onClick={() => setPropertyForm((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] }))}>{a}</button>
                  ))}
                </div>
              </div>
              <fieldset className="form-fieldset" style={{ marginTop: '0.75rem' }}>
                <legend>Insurance</legend>
                <div className="form-grid">
                  <label>Provider <input value={propertyForm.insuranceProvider} onChange={(e) => setPropertyForm((f) => ({ ...f, insuranceProvider: e.target.value }))} placeholder="e.g. State Farm" /></label>
                  <label>Policy # <input value={propertyForm.insurancePolicyNumber} onChange={(e) => setPropertyForm((f) => ({ ...f, insurancePolicyNumber: e.target.value }))} /></label>
                  <label>Expiry date <input type="date" value={propertyForm.insuranceExpiry} onChange={(e) => setPropertyForm((f) => ({ ...f, insuranceExpiry: e.target.value }))} /></label>
                </div>
              </fieldset>
              <label style={{ marginTop: '0.75rem' }}>Notes <textarea value={propertyForm.notes} onChange={(e) => setPropertyForm((f) => ({ ...f, notes: e.target.value }))} rows={2} /></label>
              <div className="form-actions">
                <button type="submit" className="btn primary">Save</button>
                <button type="button" className="btn" onClick={() => setEditingProperty(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="stats-grid two" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <span className="stat-label">Monthly rent (expected)</span>
          <span className="stat-value">{formatMoney(summary.totalMonthlyRent)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Collected this month</span>
          <span className="stat-value positive">{formatMoney(summary.collectedThisMonth)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Expenses this month</span>
          <span className="stat-value negative">{formatMoney(summary.expensesThisMonth)}</span>
        </div>
        <div className="stat-card highlight">
          <span className="stat-label">Net this month</span>
          <span className="stat-value">{formatMoney(summary.netThisMonth)}</span>
        </div>
      </div>

      {propMaintenance.length > 0 && (
        <section className="card section-card alert-section" style={{ marginBottom: '1.5rem' }}>
          <h2>Open Maintenance ({propMaintenance.length})</h2>
          <ul className="rent-due-list">
            {propMaintenance.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span className={`badge priority-${r.priority}`}>{r.priority}</span>
                <strong>{r.title}</strong>
                {r.unitId && <span className="muted"> — {units.find((u) => u.id === r.unitId)?.name}</span>}
                <Link to="/maintenance" className="btn small">View</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card section-card">
        {isSingleUnitProp(prop.propertyType) ? (
          <div className="section-card-header">
            <h2>Tenant &amp; lease</h2>
          </div>
        ) : (
          <>
            <div className="section-card-header">
              <h2>Units</h2>
              <button type="button" className="btn primary" onClick={() => setUnitForm(!unitForm)}>
                {unitForm ? 'Cancel' : '+ Add unit'}
              </button>
            </div>
            {unitForm && (
              <form className="form-card" onSubmit={handleAddUnit} style={{ marginBottom: '1rem' }}>
                <div className="form-grid">
                  <label>Name * <input required placeholder="Unit name" value={newUnit.name} onChange={(e) => setNewUnit((u) => ({ ...u, name: e.target.value }))} /></label>
                  <label>Beds <input type="number" min={0} value={newUnit.bedrooms} onChange={(e) => setNewUnit((u) => ({ ...u, bedrooms: +e.target.value || 0 }))} /></label>
                  <label>Baths <input type="number" min={0} step={0.5} value={newUnit.bathrooms} onChange={(e) => setNewUnit((u) => ({ ...u, bathrooms: +e.target.value || 0 }))} /></label>
                  <label>Sq ft <input type="number" min={0} value={newUnit.sqft || ''} onChange={(e) => setNewUnit((u) => ({ ...u, sqft: +e.target.value || 0 }))} /></label>
                  <label>Monthly rent * <input type="number" min={0} value={newUnit.monthlyRent || ''} onChange={(e) => setNewUnit((u) => ({ ...u, monthlyRent: +e.target.value || 0 }))} /></label>
                  <label>Deposit <input type="number" min={0} value={newUnit.deposit || ''} onChange={(e) => setNewUnit((u) => ({ ...u, deposit: +e.target.value || 0 }))} /></label>
                </div>
                <label>Notes <input placeholder="Optional notes" value={newUnit.notes} onChange={(e) => setNewUnit((u) => ({ ...u, notes: e.target.value }))} /></label>
                <div className="form-actions"><button type="submit" className="btn primary">Add unit</button></div>
              </form>
            )}
          </>
        )}
        <div className="units-list">
          {propUnits.length === 0 ? (
            <p className="empty-state">{isSingleUnitProp(prop.propertyType) ? 'No unit found. This may have been created before the auto-unit feature.' : 'No units. Add one above.'}</p>
          ) : (
            propUnits.map((unit) => {
              const tenant = propTenants.find((t) => t.unitId === unit.id)
              const isEditingUnit = editingUnitId === unit.id
              return (
                <div key={unit.id} className="unit-row">
                  {isEditingUnit ? (
                    <form
                      className="unit-edit-inline"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const form = e.currentTarget
                        const name = (form.querySelector('[name="unit-name"]') as HTMLInputElement)?.value ?? unit.name
                        const bedrooms = parseInt((form.querySelector('[name="unit-bedrooms"]') as HTMLInputElement)?.value ?? '0', 10) || 0
                        const bathrooms = parseFloat((form.querySelector('[name="unit-bathrooms"]') as HTMLInputElement)?.value ?? '0') || 0
                        const monthlyRent = parseFloat((form.querySelector('[name="unit-rent"]') as HTMLInputElement)?.value ?? '0') || 0
                        const sqft = parseInt((form.querySelector('[name="unit-sqft"]') as HTMLInputElement)?.value ?? '0', 10) || undefined
                        const deposit = parseFloat((form.querySelector('[name="unit-deposit"]') as HTMLInputElement)?.value ?? '0') || undefined
                        const notes = (form.querySelector('[name="unit-notes"]') as HTMLInputElement)?.value || undefined
                        updateUnit(unit.id, { name, bedrooms, bathrooms, monthlyRent, sqft, deposit, notes })
                        setEditingUnitId(null)
                        toast('Unit updated')
                      }}
                    >
                      <input name="unit-name" defaultValue={unit.name} placeholder="Unit name" required />
                      <input name="unit-bedrooms" type="number" min={0} defaultValue={unit.bedrooms} placeholder="Beds" />
                      <input name="unit-bathrooms" type="number" min={0} step={0.5} defaultValue={unit.bathrooms} placeholder="Baths" />
                      <input name="unit-sqft" type="number" min={0} defaultValue={unit.sqft ?? ''} placeholder="Sq ft" />
                      <input name="unit-rent" type="number" min={0} defaultValue={unit.monthlyRent} placeholder="Rent" />
                      <input name="unit-deposit" type="number" min={0} defaultValue={unit.deposit ?? ''} placeholder="Deposit" />
                      <input name="unit-notes" defaultValue={unit.notes ?? ''} placeholder="Notes" />
                      <button type="submit" className="btn small primary">Save</button>
                      <button type="button" className="btn small" onClick={() => setEditingUnitId(null)}>Cancel</button>
                    </form>
                  ) : isSingleUnitProp(prop.propertyType) ? (
                    /* ── Beautiful single-unit layout ── */
                    <>
                      {tenant ? (
                        <div className="single-tenant-card">
                          <div className="stc-header">
                            <div className="stc-avatar"><User size={22} /></div>
                            <div className="stc-name-block">
                              <h3 className="stc-name">{tenant.name}</h3>
                              <div className="stc-contact">
                                {tenant.phone && <span><Phone size={13} /> {tenant.phone}</span>}
                                {tenant.email && <span><Mail size={13} /> {tenant.email}</span>}
                              </div>
                            </div>
                            {(() => {
                              const status = getLeaseStatus(tenant.leaseEnd)
                              if (status === 'expired') return <span className="badge expired">Lease expired</span>
                              if (status === 'expiring') return <span className="badge expiring">Expiring soon</span>
                              return <span className="badge active-lease">Active</span>
                            })()}
                          </div>

                          <div className="stc-details-grid">
                            <div className="stc-detail">
                              <CalendarDays size={14} className="stc-detail-icon" />
                              <div>
                                <span className="stc-detail-label">Lease period</span>
                                <span className="stc-detail-value">{formatDate(tenant.leaseStart)} — {formatDate(tenant.leaseEnd)}</span>
                              </div>
                            </div>
                            <div className="stc-detail">
                              <DollarSign size={14} className="stc-detail-icon" />
                              <div>
                                <span className="stc-detail-label">Monthly rent</span>
                                <span className="stc-detail-value">{formatMoney(unit.monthlyRent)}</span>
                              </div>
                            </div>
                            {tenant.deposit != null && tenant.deposit > 0 && (
                              <div className="stc-detail">
                                <ShieldCheck size={14} className="stc-detail-icon" />
                                <div>
                                  <span className="stc-detail-label">Security deposit</span>
                                  <span className="stc-detail-value">{formatMoney(tenant.deposit)}</span>
                                </div>
                              </div>
                            )}
                            <div className="stc-detail">
                              <BedDouble size={14} className="stc-detail-icon" />
                              <div>
                                <span className="stc-detail-label">Layout</span>
                                <span className="stc-detail-value">{unit.bedrooms} bed, {unit.bathrooms} bath{unit.sqft != null && unit.sqft > 0 ? ` · ${unit.sqft.toLocaleString()} sqft` : ''}</span>
                              </div>
                            </div>
                            {(tenant.gracePeriodDays != null && tenant.gracePeriodDays > 0) && (
                              <div className="stc-detail">
                                <Clock size={14} className="stc-detail-icon" />
                                <div>
                                  <span className="stc-detail-label">Grace period</span>
                                  <span className="stc-detail-value">{tenant.gracePeriodDays} days{tenant.lateFeeAmount != null && tenant.lateFeeAmount > 0 ? ` · ${formatMoney(tenant.lateFeeAmount)} late fee` : ''}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {tenant.notes && <p className="stc-notes">{tenant.notes}</p>}

                          {tenant.rentHistory && tenant.rentHistory.length > 0 && (
                            <div className="stc-rent-history">
                              <span className="stc-detail-label">Rent changes</span>
                              {tenant.rentHistory.map((r, i) => (
                                <span key={i} className="stc-rent-change">{formatDate(r.date)}: {formatMoney(r.oldRent)} → {formatMoney(r.newRent)}</span>
                              ))}
                            </div>
                          )}

                          <div className="stc-actions">
                            <button type="button" className="btn small primary" onClick={() => { setPaymentForm(tenant.id); setNewPayment({ tenantId: tenant.id, amount: tenant.monthlyRent, date: nowISO(), method: 'transfer', notes: '' }) }}>
                              <CreditCard size={14} /> Record payment
                            </button>
                            <button type="button" className="btn small" onClick={() => { setTenantForm(null); setEditingTenantId(tenant.id); setNewTenant({ unitId: tenant.unitId, name: tenant.name, email: tenant.email ?? '', phone: tenant.phone ?? '', leaseStart: tenant.leaseStart, leaseEnd: tenant.leaseEnd, monthlyRent: tenant.monthlyRent, deposit: tenant.deposit ?? 0, gracePeriodDays: tenant.gracePeriodDays ?? 5, lateFeeAmount: tenant.lateFeeAmount ?? 0, notes: tenant.notes ?? '' }); }}>Edit tenant</button>
                            <button type="button" className="btn small" onClick={() => setPaymentHistoryTenant(tenant.id)}>Payment history</button>
                            <button type="button" className="btn small" onClick={() => setNoteEntity({ type: 'tenant', id: tenant.id })}>Add note</button>
                            <button type="button" className="btn small" onClick={() => { setShowMoveOut(tenant.id); setMoveOutDate(nowISO()); setMoveOutNotes(''); setDepositReturned(tenant.deposit ?? 0); setDepositDeductions(''); }}>Move out</button>
                            <button type="button" className="btn small danger" onClick={() => handleDeleteTenant(tenant.id, tenant.name)}>Remove tenant</button>
                          </div>
                        </div>
                      ) : (
                        <div className="single-tenant-card stc-vacant">
                          <div className="stc-vacant-content">
                            <div className="stc-details-grid" style={{ marginBottom: '1rem' }}>
                              <div className="stc-detail">
                                <BedDouble size={14} className="stc-detail-icon" />
                                <div>
                                  <span className="stc-detail-label">Layout</span>
                                  <span className="stc-detail-value">{unit.bedrooms} bed, {unit.bathrooms} bath{unit.sqft != null && unit.sqft > 0 ? ` · ${unit.sqft.toLocaleString()} sqft` : ''}</span>
                                </div>
                              </div>
                              <div className="stc-detail">
                                <DollarSign size={14} className="stc-detail-icon" />
                                <div>
                                  <span className="stc-detail-label">Monthly rent</span>
                                  <span className="stc-detail-value">{formatMoney(unit.monthlyRent)}</span>
                                </div>
                              </div>
                              {unit.deposit != null && unit.deposit > 0 && (
                                <div className="stc-detail">
                                  <ShieldCheck size={14} className="stc-detail-icon" />
                                  <div>
                                    <span className="stc-detail-label">Required deposit</span>
                                    <span className="stc-detail-value">{formatMoney(unit.deposit)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="stc-vacant-banner">
                              <User size={18} />
                              <div>
                                <strong>Vacant</strong>
                                <span>This property is ready for a new tenant.</span>
                              </div>
                            </div>
                            <div className="stc-actions">
                              <button type="button" className="btn primary" onClick={() => { setEditingTenantId(null); setTenantForm(unit.id); setNewTenant({ unitId: unit.id, name: '', email: '', phone: '', leaseStart: '', leaseEnd: '', monthlyRent: unit.monthlyRent, deposit: unit.deposit ?? 0, gracePeriodDays: 5, lateFeeAmount: 0, notes: '' }); }}>
                                <User size={14} /> Add tenant
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* ── Standard multi-unit row layout ── */
                    <>
                      <div>
                        <strong>{unit.name}</strong>
                        <span className="muted"> — {unit.bedrooms} bed, {unit.bathrooms} bath</span>
                        {unit.sqft != null && unit.sqft > 0 && <span className="muted">, {unit.sqft} sqft</span>}
                        <span className="muted"> · {formatMoney(unit.monthlyRent)}/mo</span>
                        {unit.deposit != null && unit.deposit > 0 && <span className="muted"> · Deposit: {formatMoney(unit.deposit)}</span>}
                        {unit.notes && <span className="muted block">Note: {unit.notes}</span>}
                        {tenant && (
                          <>
                            <span className="tenant-inline-info">
                              <span> · Tenant: <strong>{tenant.name}</strong></span>
                              {tenant.phone && <span className="muted"> · {tenant.phone}</span>}
                              {tenant.email && <span className="muted"> · {tenant.email}</span>}
                            </span>
                            <span className="tenant-lease-dates muted block">
                              Lease: {formatDate(tenant.leaseStart)} — {formatDate(tenant.leaseEnd)}
                              {tenant.deposit != null && tenant.deposit > 0 && <> · Deposit held: {formatMoney(tenant.deposit)}</>}
                              {tenant.gracePeriodDays != null && tenant.gracePeriodDays > 0 && <> · Grace: {tenant.gracePeriodDays}d</>}
                              {tenant.lateFeeAmount != null && tenant.lateFeeAmount > 0 && <> · Late fee: {formatMoney(tenant.lateFeeAmount)}</>}
                            </span>
                            {tenant.notes && <span className="muted block">Note: {tenant.notes}</span>}
                            {tenant.rentHistory && tenant.rentHistory.length > 0 && (
                              <span className="muted block">Rent history: {tenant.rentHistory.map((r, i) => (
                                <span key={i}>{formatDate(r.date)}: {formatMoney(r.oldRent)} → {formatMoney(r.newRent)}{i < tenant.rentHistory!.length - 1 ? ', ' : ''}</span>
                              ))}</span>
                            )}
                            {(() => {
                              const status = getLeaseStatus(tenant.leaseEnd)
                              if (status === 'expired') return <span className="badge expired">Lease expired</span>
                              if (status === 'expiring') return <span className="badge expiring">Lease expiring</span>
                              return <span className="badge active-lease">Active</span>
                            })()}
                          </>
                        )}
                        {unit.available && !tenant && <span className="badge available">Available</span>}
                      </div>
                      <div className="row-actions">
                        <button type="button" className="btn small" onClick={() => setEditingUnitId(unit.id)}>Edit unit</button>
                        <button type="button" className="btn small" onClick={() => setNoteEntity({ type: 'unit', id: unit.id })}>Add note</button>
                        {!tenant && (
                          <button type="button" className="btn small danger" onClick={() => handleDeleteUnit(unit.id, unit.name)}>Delete unit</button>
                        )}
                        {!tenant && unit.available && (
                          <button
                            type="button"
                            className="btn small primary"
                            onClick={() => {
                              setEditingTenantId(null)
                              setTenantForm(unit.id)
                              setNewTenant({ unitId: unit.id, name: '', email: '', phone: '', leaseStart: '', leaseEnd: '', monthlyRent: unit.monthlyRent, deposit: unit.deposit ?? 0, gracePeriodDays: 5, lateFeeAmount: 0, notes: '' })
                            }}
                          >
                            Add tenant
                          </button>
                        )}
                        {tenant && (
                          <>
                            <button
                              type="button"
                              className="btn small primary"
                              onClick={() => {
                                setPaymentForm(tenant.id)
                                setNewPayment({ tenantId: tenant.id, amount: tenant.monthlyRent, date: nowISO(), method: 'transfer', notes: '' })
                              }}
                            >
                              Record payment
                            </button>
                            <button type="button" className="btn small" onClick={() => { setTenantForm(null); setEditingTenantId(tenant.id); setNewTenant({ unitId: tenant.unitId, name: tenant.name, email: tenant.email ?? '', phone: tenant.phone ?? '', leaseStart: tenant.leaseStart, leaseEnd: tenant.leaseEnd, monthlyRent: tenant.monthlyRent, deposit: tenant.deposit ?? 0, gracePeriodDays: tenant.gracePeriodDays ?? 5, lateFeeAmount: tenant.lateFeeAmount ?? 0, notes: tenant.notes ?? '' }); }}>Edit tenant</button>
                            <button type="button" className="btn small" onClick={() => setPaymentHistoryTenant(tenant.id)}>Payment history</button>
                            <button type="button" className="btn small" onClick={() => setNoteEntity({ type: 'tenant', id: tenant.id })}>Add note</button>
                            <button type="button" className="btn small" onClick={() => { setShowMoveOut(tenant.id); setMoveOutDate(nowISO()); setMoveOutNotes(''); setDepositReturned(tenant.deposit ?? 0); setDepositDeductions(''); }}>Move out</button>
                            <button type="button" className="btn small danger" onClick={() => handleDeleteTenant(tenant.id, tenant.name)}>Remove tenant</button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </section>

      {noteEntity && (
        <div className="card form-card" style={{ marginTop: '1rem' }}>
          <h3>Add note — {noteEntity.type === 'property' ? prop.name : noteEntity.type === 'unit' ? units.find((u) => u.id === noteEntity.id)?.name : tenants.find((t) => t.id === noteEntity.id)?.name}</h3>
          <textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Enter your note..." />
          <div className="form-actions">
            <button type="button" className="btn primary" onClick={handleAddNote} disabled={!noteText.trim()}>Save note</button>
            <button type="button" className="btn" onClick={() => setNoteEntity(null)}>Cancel</button>
          </div>
        </div>
      )}

      {showMoveOut && (() => {
        const t = tenants.find((x) => x.id === showMoveOut)
        if (!t) return null
        return (
          <div className="card form-card" style={{ marginTop: '1rem' }}>
            <h3>Move-out: {t.name}</h3>
            <div className="form-grid">
              <label>Move-out date * <input type="date" required value={moveOutDate} onChange={(e) => setMoveOutDate(e.target.value)} /></label>
              <label>Deposit held <div className="form-static">{formatMoney(t.deposit ?? 0)}</div></label>
              <label>Amount returned <input type="number" min={0} step={0.01} value={depositReturned || ''} onChange={(e) => setDepositReturned(+e.target.value)} /></label>
              <label>Deductions <input value={depositDeductions} onChange={(e) => setDepositDeductions(e.target.value)} placeholder="e.g. Carpet replacement, wall damage" /></label>
            </div>
            <label style={{ marginTop: '0.75rem' }}>Move-out notes <textarea rows={2} value={moveOutNotes} onChange={(e) => setMoveOutNotes(e.target.value)} placeholder="Condition notes, inspection results..." /></label>
            <div className="form-actions">
              <button type="button" className="btn primary" onClick={() => handleMoveOut(showMoveOut)}>Complete move-out</button>
              <button type="button" className="btn" onClick={() => setShowMoveOut(null)}>Cancel</button>
            </div>
          </div>
        )
      })()}

      {tenantForm && (
        <form className="card form-card" onSubmit={handleAddTenant}>
          <h3>Add tenant{newTenant.unitId ? ` — ${propUnits.find((u) => u.id === newTenant.unitId)?.name ?? 'Unit'}` : ''}</h3>
          <input type="hidden" value={newTenant.unitId} />
          <div className="form-grid">
            <label>Name * <input required value={newTenant.name} onChange={(e) => setNewTenant((n) => ({ ...n, name: e.target.value }))} /></label>
            <label>Email <input type="email" value={newTenant.email} onChange={(e) => setNewTenant((n) => ({ ...n, email: e.target.value }))} /></label>
            <label>Phone <input type="tel" value={newTenant.phone} onChange={(e) => setNewTenant((n) => ({ ...n, phone: formatPhoneNumber(e.target.value) }))} placeholder="(555) 123-4567" /></label>
            <label>Lease start * <input type="date" required value={newTenant.leaseStart} onChange={(e) => setNewTenant((n) => ({ ...n, leaseStart: e.target.value }))} /></label>
            <label>Lease end * <input type="date" required value={newTenant.leaseEnd} onChange={(e) => setNewTenant((n) => ({ ...n, leaseEnd: e.target.value }))} /></label>
            <label>Monthly rent * <input type="number" min={0} required value={newTenant.monthlyRent || ''} onChange={(e) => setNewTenant((n) => ({ ...n, monthlyRent: +e.target.value }))} /></label>
            <label>Security deposit <input type="number" min={0} value={newTenant.deposit || ''} onChange={(e) => setNewTenant((n) => ({ ...n, deposit: +e.target.value }))} /></label>
            <label>Grace period (days) <input type="number" min={0} value={newTenant.gracePeriodDays || ''} onChange={(e) => setNewTenant((n) => ({ ...n, gracePeriodDays: +e.target.value }))} /></label>
            <label>Late fee <input type="number" min={0} step={0.01} value={newTenant.lateFeeAmount || ''} onChange={(e) => setNewTenant((n) => ({ ...n, lateFeeAmount: +e.target.value }))} /></label>
          </div>
          <label>Notes <textarea value={newTenant.notes} onChange={(e) => setNewTenant((n) => ({ ...n, notes: e.target.value }))} rows={2} /></label>
          <div className="form-actions">
            <button type="submit" className="btn primary">Save tenant</button>
            <button type="button" className="btn" onClick={() => setTenantForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      {editingTenantId && (
        <form
          className="card form-card"
          onSubmit={(e) => {
            e.preventDefault()
            if (newTenant.leaseEnd <= newTenant.leaseStart) {
              toast('Lease end date must be after start date', 'error')
              return
            }
            const overlapping = tenants.find(
              (t) => t.unitId === newTenant.unitId && t.id !== editingTenantId &&
                t.leaseStart <= newTenant.leaseEnd && t.leaseEnd >= newTenant.leaseStart
            )
            if (overlapping) {
              toast(`Lease overlaps with "${overlapping.name}" (${formatDate(overlapping.leaseStart)} – ${formatDate(overlapping.leaseEnd)})`, 'error')
              return
            }
            updateTenant(editingTenantId, {
              name: newTenant.name,
              email: newTenant.email || undefined,
              phone: newTenant.phone || undefined,
              leaseStart: newTenant.leaseStart,
              leaseEnd: newTenant.leaseEnd,
              monthlyRent: newTenant.monthlyRent,
              deposit: newTenant.deposit || undefined,
              gracePeriodDays: newTenant.gracePeriodDays || undefined,
              lateFeeAmount: newTenant.lateFeeAmount || undefined,
              notes: newTenant.notes || undefined,
            })
            setEditingTenantId(null)
            toast('Tenant updated')
          }}
        >
          <h3>Edit tenant</h3>
          <div className="form-grid">
            <label>Name * <input required value={newTenant.name} onChange={(e) => setNewTenant((n) => ({ ...n, name: e.target.value }))} /></label>
            <label>Email <input type="email" value={newTenant.email} onChange={(e) => setNewTenant((n) => ({ ...n, email: e.target.value }))} /></label>
            <label>Phone <input type="tel" value={newTenant.phone} onChange={(e) => setNewTenant((n) => ({ ...n, phone: formatPhoneNumber(e.target.value) }))} placeholder="(555) 123-4567" /></label>
            <label>Lease start * <input type="date" required value={newTenant.leaseStart} onChange={(e) => setNewTenant((n) => ({ ...n, leaseStart: e.target.value }))} /></label>
            <label>Lease end * <input type="date" required value={newTenant.leaseEnd} onChange={(e) => setNewTenant((n) => ({ ...n, leaseEnd: e.target.value }))} /></label>
            <label>Monthly rent * <input type="number" min={0} required value={newTenant.monthlyRent || ''} onChange={(e) => setNewTenant((n) => ({ ...n, monthlyRent: +e.target.value }))} /></label>
            <label>Security deposit <input type="number" min={0} value={newTenant.deposit || ''} onChange={(e) => setNewTenant((n) => ({ ...n, deposit: +e.target.value }))} /></label>
            <label>Grace period (days) <input type="number" min={0} value={newTenant.gracePeriodDays || ''} onChange={(e) => setNewTenant((n) => ({ ...n, gracePeriodDays: +e.target.value }))} /></label>
            <label>Late fee <input type="number" min={0} step={0.01} value={newTenant.lateFeeAmount || ''} onChange={(e) => setNewTenant((n) => ({ ...n, lateFeeAmount: +e.target.value }))} /></label>
          </div>
          <label>Notes <textarea value={newTenant.notes} onChange={(e) => setNewTenant((n) => ({ ...n, notes: e.target.value }))} rows={2} /></label>
          <div className="form-actions">
            <button type="submit" className="btn primary">Save changes</button>
            <button type="button" className="btn" onClick={() => setEditingTenantId(null)}>Cancel</button>
          </div>
        </form>
      )}

      {paymentForm && (
        <form className="card form-card" onSubmit={handleRecordPayment}>
          <h3>Record rent payment</h3>
          <div className="form-grid">
            <label>
              Tenant
              <select
                required
                value={newPayment.tenantId}
                onChange={(e) => {
                  const t = tenants.find((x) => x.id === e.target.value)
                  setNewPayment((p) => ({ ...p, tenantId: e.target.value, amount: t?.monthlyRent ?? 0 }))
                }}
              >
                <option value="">Select tenant</option>
                {propTenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.monthlyRent)}</option>
                ))}
              </select>
            </label>
            <label>Amount * <input type="number" min={0} step={0.01} required value={newPayment.amount || ''} onChange={(e) => setNewPayment((p) => ({ ...p, amount: +e.target.value }))} /></label>
            <label>Date * <input type="date" required value={newPayment.date} onChange={(e) => setNewPayment((p) => ({ ...p, date: e.target.value }))} /></label>
            <label>Method <select value={newPayment.method} onChange={(e) => setNewPayment((p) => ({ ...p, method: e.target.value as any }))}><option value="check">Check</option><option value="transfer">Transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
          </div>
          <label>Notes <input value={newPayment.notes} onChange={(e) => setNewPayment((p) => ({ ...p, notes: e.target.value }))} placeholder="e.g. Check #1234, partial payment" /></label>
          <div className="form-actions">
            <button type="submit" className="btn primary">Record payment</button>
            <button type="button" className="btn" onClick={() => setPaymentForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      <section className="card section-card">
        <h2>Recent payments</h2>
        {propPayments.length === 0 ? (
          <p className="empty-state">No payments recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Tenant</th><th>Amount</th><th>Method</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {propPayments
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 10)
                .map((p) => {
                  const t = tenants.find((x) => x.id === p.tenantId)
                  return (
                    <tr key={p.id}>
                      <td>{formatDate(p.date)}</td>
                      <td>{t?.name ?? '—'}</td>
                      <td className="positive">{formatMoney(p.amount)}</td>
                      <td>{p.method ?? '—'}</td>
                      <td className="muted">{p.notes ?? ''}</td>
                      <td><button type="button" className="btn small" onClick={() => handleDeletePaymentClick(p.id)}>Delete</button></td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card section-card">
        <h2>Expenses (this property)</h2>
        <p className="muted">Add expenses from the <Link to="/expenses">Expenses</Link> page and assign this property.</p>
        {propExpenses.length === 0 ? (
          <p className="empty-state">No expenses for this property.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
            <tbody>
              {propExpenses
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 10)
                .map((e) => (
                  <tr key={e.id}><td>{formatDate(e.date)}</td><td>{EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}</td><td>{e.description}</td><td className="negative">{formatMoney(e.amount)}</td></tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Communication Log */}
      <section className="card section-card">
        <div className="section-card-header">
          <h2>Communication log</h2>
          {propTenants.length > 0 && (
            <button type="button" className="btn small primary" onClick={() => { setCommForm(commForm ? null : 'new'); setNewComm({ type: 'call', date: nowISO(), subject: '', notes: '' }) }}>
              {commForm ? 'Cancel' : '+ Log communication'}
            </button>
          )}
        </div>
        {commForm && (
          <form className="form-card" style={{ marginBottom: '1rem' }} onSubmit={(e) => {
            e.preventDefault()
            const tenantId = (e.currentTarget.querySelector('[name="comm-tenant"]') as HTMLSelectElement)?.value
            if (!tenantId || !newComm.subject.trim()) return
            const t = tenants.find((x) => x.id === tenantId)
            addCommunicationLog({
              tenantId,
              propertyId: prop.id,
              type: newComm.type,
              date: newComm.date,
              subject: newComm.subject,
              notes: newComm.notes || undefined,
            })
            setCommForm(null)
            toast(`Communication with ${t?.name ?? 'tenant'} logged`)
          }}>
            <div className="form-grid">
              <label>Tenant * <select name="comm-tenant" required>
                <option value="">Select tenant</option>
                {propTenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></label>
              <label>Type <select value={newComm.type} onChange={(e) => setNewComm((c) => ({ ...c, type: e.target.value as CommunicationType }))}>
                {COMM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></label>
              <label>Date * <input type="date" required value={newComm.date} onChange={(e) => setNewComm((c) => ({ ...c, date: e.target.value }))} /></label>
            </div>
            <label>Subject * <input required value={newComm.subject} onChange={(e) => setNewComm((c) => ({ ...c, subject: e.target.value }))} placeholder="e.g. Discussed lease renewal" /></label>
            <label style={{ marginTop: '0.5rem' }}>Notes <textarea rows={2} value={newComm.notes} onChange={(e) => setNewComm((c) => ({ ...c, notes: e.target.value }))} placeholder="Details of the conversation..." /></label>
            <div className="form-actions"><button type="submit" className="btn primary">Save</button></div>
          </form>
        )}
        {(() => {
          const propComms = communicationLogs
            .filter((c) => c.propertyId === prop.id)
            .sort((a, b) => b.date.localeCompare(a.date))
          if (propComms.length === 0) return <p className="empty-state">No communications logged yet.{propTenants.length === 0 ? ' Add a tenant first.' : ''}</p>
          return (
            <div className="activity-timeline">
              {propComms.slice(0, 20).map((c) => {
                const t = tenants.find((x) => x.id === c.tenantId)
                return (
                  <div key={c.id} className="activity-item">
                    <span className="activity-date">{formatDate(c.date)}</span>
                    <span className="badge small">{COMM_TYPES.find((ct) => ct.value === c.type)?.label ?? c.type}</span>
                    <strong>{t?.name ?? 'Unknown'}</strong>
                    <span className="activity-note">{c.subject}{c.notes ? ` — ${c.notes}` : ''}</span>
                    <button type="button" className="btn-icon small" onClick={async () => { if (await confirm({ title: 'Delete communication', message: 'Delete this entry?', confirmText: 'Delete', danger: true })) { deleteCommunicationLog(c.id); toast('Entry deleted') } }} title="Delete">×</button>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </section>

      {propLogs.length > 0 && (
        <section className="card section-card">
          <div className="section-card-header">
            <h2>Activity log</h2>
            <button type="button" className="btn small" onClick={() => setNoteEntity({ type: 'property', id: prop.id })}>Add note</button>
          </div>
          <div className="activity-timeline">
            {propLogs.slice(0, 20).map((log) => {
              let entityLabel = ''
              if (log.entityType === 'property') entityLabel = prop.name
              else if (log.entityType === 'unit') entityLabel = units.find((u) => u.id === log.entityId)?.name ?? 'Unit'
              else entityLabel = tenants.find((t) => t.id === log.entityId)?.name ?? 'Tenant'
              return (
                <div key={log.id} className="activity-item">
                  <span className="activity-date">{formatDate(log.date)}</span>
                  <span className="activity-entity badge">{log.entityType}: {entityLabel}</span>
                  <span className="activity-note">{log.note}</span>
                  <button type="button" className="btn-icon small" onClick={async () => { if (await confirm({ title: 'Delete note', message: 'Delete this note?', confirmText: 'Delete', danger: true })) { deleteActivityLog(log.id); toast('Note deleted') } }} title="Delete note">×</button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {propLogs.length === 0 && (
        <section className="card section-card">
          <div className="section-card-header">
            <h2>Activity log</h2>
            <button type="button" className="btn small" onClick={() => setNoteEntity({ type: 'property', id: prop.id })}>Add note</button>
          </div>
          <p className="empty-state">No notes yet. Add notes to track interactions, inspections, and other events.</p>
        </section>
      )}

      {/* Tenant payment history modal */}
      {paymentHistoryTenant && (() => {
        const t = tenants.find((x) => x.id === paymentHistoryTenant)
        if (!t) return null
        const tenantPayments = payments
          .filter((p) => p.tenantId === t.id)
          .sort((a, b) => b.date.localeCompare(a.date))
        const totalPaid = tenantPayments.reduce((s, p) => s + p.amount, 0)
        return (
          <div className="modal-overlay" onClick={() => setPaymentHistoryTenant(null)}>
            <div className="modal card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Payment history — {t.name}</h3>
                <button type="button" className="btn-icon" onClick={() => setPaymentHistoryTenant(null)} aria-label="Close">×</button>
              </div>
              <p className="muted" style={{ marginBottom: '1rem' }}>
                Total paid: <strong className="positive">{formatMoney(totalPaid)}</strong> across {tenantPayments.length} payment{tenantPayments.length !== 1 ? 's' : ''}
              </p>
              {tenantPayments.length === 0 ? (
                <p className="empty-state">No payments recorded for this tenant.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Period</th><th>Notes</th></tr></thead>
                    <tbody>
                      {tenantPayments.map((p) => (
                        <tr key={p.id}>
                          <td>{formatDate(p.date)}</td>
                          <td className="positive">{formatMoney(p.amount)}</td>
                          <td>{p.method ?? '—'}</td>
                          <td className="muted">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</td>
                          <td className="muted">{p.notes ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
