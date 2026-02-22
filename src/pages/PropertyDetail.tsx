import { useState, useEffect } from 'react'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import {
  addUnit, updateUnit, deleteUnit,
  deleteTenant, deletePayment, deleteProperty,
  addActivityLog, takeSnapshot, restoreSnapshot,
} from '../store'
import DocumentAttachments from '../components/DocumentAttachments'
import { getPropertySummary, getLeaseStatus, getTenantReliability } from '../lib/calculations'
import type { ReliabilityGrade } from '../lib/calculations'
import { loadSettings } from '../lib/settings'
import { nowISO } from '../lib/id'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatMoney, formatDate } from '../lib/format'
import Breadcrumbs from '../components/Breadcrumbs'
import type { PropertyType, Tenant, Payment } from '../types'
import { User, Phone, Mail, CalendarDays, DollarSign, Clock, ShieldCheck, BedDouble, CreditCard } from 'lucide-react'
import PaymentHistoryModal from '../components/PaymentHistoryModal'
import RecentPayments from '../components/RecentPayments'
import PropertyExpenses from '../components/PropertyExpenses'
import CommunicationLogSection from '../components/CommunicationLog'
import ActivityLogSection from '../components/ActivityLog'
import PropertyEditForm from '../components/property/PropertyEditForm'
import TenantForm from '../components/property/TenantForm'
import type { TenantFormData } from '../components/property/TenantForm'
import RecordPaymentForm from '../components/property/RecordPaymentForm'
import MoveOutForm from '../components/property/MoveOutForm'

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'single_family', label: 'Single Family' },
  { value: 'multi_family', label: 'Multi Family' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' },
]

const SINGLE_UNIT_TYPES: PropertyType[] = ['single_family', 'condo', 'townhouse']
function isSingleUnitProp(type?: string): boolean {
  return SINGLE_UNIT_TYPES.includes(type as PropertyType)
}

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { properties, units, tenants, expenses, payments, maintenanceRequests, activityLogs, communicationLogs } = useStore()

  const [paymentHistoryTenant, setPaymentHistoryTenant] = useState<string | null>(null)
  const [unitForm, setUnitForm] = useState(false)
  const [tenantFormUnitId, setTenantFormUnitId] = useState<string | null>(null)
  const [paymentFormTenantId, setPaymentFormTenantId] = useState<string | null>(null)
  const [editingProperty, setEditingProperty] = useState(false)
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
  const [tenantFormData, setTenantFormData] = useState<TenantFormData | null>(null)
  const [paymentInitial, setPaymentInitial] = useState({ amount: 0, date: nowISO() })
  const [noteText, setNoteText] = useState('')
  const [noteEntity, setNoteEntity] = useState<{ type: 'property' | 'unit' | 'tenant'; id: string } | null>(null)
  const [showMoveOut, setShowMoveOut] = useState<string | null>(null)
  const [newUnit, setNewUnit] = useState({ name: '', bedrooms: 1, bathrooms: 1, monthlyRent: 0, sqft: 0, deposit: 0, notes: '', available: true })

  const property = properties.find((p) => p.id === id)

  useEffect(() => {
    if (id) {
      setUnitForm(false)
      setTenantFormUnitId(null)
      setPaymentFormTenantId(null)
      setEditingProperty(false)
      setEditingUnitId(null)
      setEditingTenantId(null)
      setNoteEntity(null)
      setShowMoveOut(null)
    }
  }, [id])

  useEffect(() => {
    if (searchParams.get('addTenant') === '1' && id) {
      const propUnitsLocal = units.filter((u) => u.propertyId === id)
      const firstAvailable = propUnitsLocal.find((u) => !tenants.some((t) => t.unitId === u.id))
      if (firstAvailable) {
        setEditingTenantId(null)
        setTenantFormUnitId(firstAvailable.id)
        setTenantFormData({ unitId: firstAvailable.id, name: '', email: '', phone: '', leaseStart: '', leaseEnd: '', monthlyRent: firstAvailable.monthlyRent, deposit: firstAvailable.deposit ?? 0, gracePeriodDays: 5, lateFeeAmount: 0, autopay: false, notes: '', requireFirstMonth: true, requireLastMonth: false })
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

  const prop = property
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
  const settings = loadSettings()

  function openAddTenant(unitId: string, rent: number, deposit: number) {
    setEditingTenantId(null)
    setTenantFormUnitId(unitId)
    setTenantFormData({ unitId, name: '', email: '', phone: '', leaseStart: '', leaseEnd: '', monthlyRent: rent, deposit, gracePeriodDays: 5, lateFeeAmount: 0, autopay: false, notes: '', requireFirstMonth: true, requireLastMonth: false })
  }

  function openEditTenant(t: typeof propTenants[0]) {
    setTenantFormUnitId(null)
    setEditingTenantId(t.id)
    setTenantFormData({ unitId: t.unitId, name: t.name, email: t.email ?? '', phone: t.phone ?? '', leaseStart: t.leaseStart, leaseEnd: t.leaseEnd, monthlyRent: t.monthlyRent, deposit: t.deposit ?? 0, gracePeriodDays: t.gracePeriodDays ?? 5, lateFeeAmount: t.lateFeeAmount ?? 0, autopay: t.autopay ?? false, notes: t.notes ?? '', requireFirstMonth: t.requireFirstMonth ?? true, requireLastMonth: t.requireLastMonth ?? false })
  }

  function openRecordPayment(tenantId: string, amount: number) {
    setPaymentFormTenantId(tenantId)
    setPaymentInitial({ amount, date: nowISO() })
  }

  async function handleDeleteProperty() {
    const ok = await confirm({ title: 'Delete property', message: `Delete "${prop.name}"? This will remove all units, tenants, expenses, and payments for this property.`, confirmText: 'Delete', danger: true })
    if (ok) {
      const snap = takeSnapshot()
      try {
        await deleteProperty(prop.id)
        navigate('/properties')
        toast('Property deleted', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); navigate(`/properties/${prop.id}`); toast('Property restored', 'info') } } })
      } catch (err) {
        toast('Failed to delete property', 'error')
      }
    }
  }

  async function handleDeleteUnit(unitId: string, unitName: string) {
    const tenant = propTenants.find((t) => t.unitId === unitId)
    if (tenant) { await confirm({ title: 'Cannot delete unit', message: 'Remove the tenant first before deleting the unit.', confirmText: 'OK' }); return }
    const ok = await confirm({ title: 'Delete unit', message: `Delete unit "${unitName}"?`, confirmText: 'Delete', danger: true })
    if (ok) {
      const snap = takeSnapshot()
      try {
        await deleteUnit(unitId)
        setEditingUnitId(null)
        toast('Unit deleted', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); toast('Unit restored', 'info') } } })
      } catch (err) {
        toast('Failed to delete unit', 'error')
      }
    }
  }

  async function handleDeleteTenant(tenantId: string, tenantName: string) {
    const ok = await confirm({ title: 'Remove tenant', message: `Remove tenant "${tenantName}"? The unit will be marked available again.`, confirmText: 'Remove', danger: true })
    if (ok) {
      const snap = takeSnapshot()
      try {
        await deleteTenant(tenantId)
        setEditingTenantId(null)
        toast('Tenant removed', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); toast('Tenant restored', 'info') } } })
      } catch (err) {
        toast('Failed to remove tenant', 'error')
      }
    }
  }

  async function handleDeletePaymentClick(paymentId: string) {
    const ok = await confirm({ title: 'Delete payment', message: 'Delete this payment record?', confirmText: 'Delete', danger: true })
    if (ok) {
      const snap = takeSnapshot()
      try {
        await deletePayment(paymentId)
        toast('Payment deleted', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); toast('Payment restored', 'info') } } })
      } catch (err) {
        toast('Failed to delete payment', 'error')
      }
    }
  }

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await addUnit({ propertyId: prop.id, name: newUnit.name, bedrooms: newUnit.bedrooms, bathrooms: newUnit.bathrooms, monthlyRent: newUnit.monthlyRent, sqft: newUnit.sqft || undefined, deposit: newUnit.deposit || undefined, notes: newUnit.notes || undefined, available: newUnit.available })
      setNewUnit({ name: '', bedrooms: 1, bathrooms: 1, monthlyRent: 0, sqft: 0, deposit: 0, notes: '', available: true })
      setUnitForm(false)
      toast('Unit added')
    } catch (err) {
      toast('Failed to add unit', 'error')
    }
  }

  async function handleAddNote() {
    if (!noteEntity || !noteText.trim()) return
    try {
      await addActivityLog({ entityType: noteEntity.type, entityId: noteEntity.id, note: noteText.trim(), date: nowISO() })
      setNoteText('')
      setNoteEntity(null)
      toast('Note added')
    } catch (err) {
      toast('Failed to add note', 'error')
    }
  }

  const showTenantForm = !!(tenantFormUnitId || editingTenantId) && tenantFormData

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
              {prop.mortgageBalance != null && prop.mortgageBalance > 0 && (
                <p className="muted">Mortgage: {formatMoney(prop.mortgageBalance)} at {prop.mortgageRate ?? 0}% · {formatMoney(prop.mortgageMonthlyPayment ?? 0)}/mo</p>
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
                <button type="button" className="btn small" onClick={() => setEditingProperty(true)}>Edit property</button>
                <button type="button" className="btn small danger" onClick={handleDeleteProperty}>Delete property</button>
              </div>
            </>
          ) : (
            <PropertyEditForm property={prop} onClose={() => setEditingProperty(false)} />
          )}
        </div>
      </div>

      <div className="stats-grid two" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card"><span className="stat-label">Monthly rent (expected)</span><span className="stat-value">{formatMoney(summary.totalMonthlyRent)}</span></div>
        <div className="stat-card"><span className="stat-label">Collected this month</span><span className="stat-value positive">{formatMoney(summary.collectedThisMonth)}</span></div>
        <div className="stat-card"><span className="stat-label">Expenses this month</span><span className="stat-value negative">{formatMoney(summary.expensesThisMonth)}</span></div>
        <div className="stat-card highlight"><span className="stat-label">Net this month</span><span className="stat-value">{formatMoney(summary.netThisMonth)}</span></div>
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
          <div className="section-card-header"><h2>Tenant &amp; lease</h2></div>
        ) : (
          <>
            <div className="section-card-header">
              <h2>Units</h2>
              <button type="button" className="btn primary" onClick={() => setUnitForm(!unitForm)}>{unitForm ? 'Cancel' : '+ Add unit'}</button>
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
                    <form className="unit-edit-inline" onSubmit={async (e) => {
                      e.preventDefault()
                      const f = e.currentTarget
                      const name = (f.querySelector('[name="unit-name"]') as HTMLInputElement)?.value ?? unit.name
                      const bedrooms = parseInt((f.querySelector('[name="unit-bedrooms"]') as HTMLInputElement)?.value ?? '0', 10) || 0
                      const bathrooms = parseFloat((f.querySelector('[name="unit-bathrooms"]') as HTMLInputElement)?.value ?? '0') || 0
                      const monthlyRent = parseFloat((f.querySelector('[name="unit-rent"]') as HTMLInputElement)?.value ?? '0') || 0
                      const sqft = parseInt((f.querySelector('[name="unit-sqft"]') as HTMLInputElement)?.value ?? '0', 10) || undefined
                      const deposit = parseFloat((f.querySelector('[name="unit-deposit"]') as HTMLInputElement)?.value ?? '0') || undefined
                      const notes = (f.querySelector('[name="unit-notes"]') as HTMLInputElement)?.value || undefined
                      try {
                        await updateUnit(unit.id, { name, bedrooms, bathrooms, monthlyRent, sqft, deposit, notes })
                        setEditingUnitId(null)
                        toast('Unit updated')
                      } catch (err) {
                        toast('Failed to update unit', 'error')
                      }
                    }}>
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
                    <>
                      {tenant ? (
                        <div className="single-tenant-card">
                          <div className="stc-header">
                            <div className="stc-avatar"><User size={22} /></div>
                            <div className="stc-name-block">
                              <h3 className="stc-name">
                                <Link to={`/tenants/${tenant.id}`} className="tenant-link">{tenant.name}</Link>
                              </h3>
                              <div className="stc-contact">
                                {tenant.phone && <span><Phone size={13} /> {tenant.phone}</span>}
                                {tenant.email && <span><Mail size={13} /> {tenant.email}</span>}
                              </div>
                            </div>
                            {(() => { const s = getLeaseStatus(tenant.leaseEnd); if (s === 'expired') return <span className="badge expired">Lease expired</span>; if (s === 'expiring') return <span className="badge expiring">Expiring soon</span>; return <span className="badge active-lease">Active</span> })()}
                            <ReliabilityBadge tenant={tenant} payments={propPayments} graceDays={settings.defaultGracePeriodDays} />
                          </div>
                          <div className="stc-details-grid">
                            <div className="stc-detail"><CalendarDays size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Lease period</span><span className="stc-detail-value">{formatDate(tenant.leaseStart)} — {formatDate(tenant.leaseEnd)}</span></div></div>
                            <div className="stc-detail"><DollarSign size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Monthly rent</span><span className="stc-detail-value">{formatMoney(unit.monthlyRent)}</span></div></div>
                            {tenant.deposit != null && tenant.deposit > 0 && (<div className="stc-detail"><ShieldCheck size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Security deposit</span><span className="stc-detail-value">{formatMoney(tenant.deposit)}</span></div></div>)}
                            <div className="stc-detail"><BedDouble size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Layout</span><span className="stc-detail-value">{unit.bedrooms} bed, {unit.bathrooms} bath{unit.sqft != null && unit.sqft > 0 ? ` · ${unit.sqft.toLocaleString()} sqft` : ''}</span></div></div>
                            {(tenant.gracePeriodDays != null && tenant.gracePeriodDays > 0) && (<div className="stc-detail"><Clock size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Grace period</span><span className="stc-detail-value">{tenant.gracePeriodDays} days{tenant.lateFeeAmount != null && tenant.lateFeeAmount > 0 ? ` · ${formatMoney(tenant.lateFeeAmount)} late fee` : ''}</span></div></div>)}
                          </div>
                          {tenant.notes && <p className="stc-notes">{tenant.notes}</p>}
                          {tenant.rentHistory && tenant.rentHistory.length > 0 && (
                            <div className="stc-rent-history">
                              <span className="stc-detail-label">Rent changes</span>
                              {tenant.rentHistory.map((r, i) => <span key={i} className="stc-rent-change">{formatDate(r.date)}: {formatMoney(r.oldRent)} → {formatMoney(r.newRent)}</span>)}
                            </div>
                          )}
                          <div className="stc-actions">
                            <button type="button" className="btn small primary" onClick={() => openRecordPayment(tenant.id, tenant.monthlyRent)}><CreditCard size={14} /> Record payment</button>
                            <button type="button" className="btn small" onClick={() => openEditTenant(tenant)}>Edit tenant</button>
                            <button type="button" className="btn small" onClick={() => setPaymentHistoryTenant(tenant.id)}>Payment history</button>
                            <button type="button" className="btn small" onClick={() => setNoteEntity({ type: 'tenant', id: tenant.id })}>Add note</button>
                            <button type="button" className="btn small" onClick={() => setShowMoveOut(tenant.id)}>Move out</button>
                            <button type="button" className="btn small danger" onClick={() => handleDeleteTenant(tenant.id, tenant.name)}>Remove tenant</button>
                          </div>
                        </div>
                      ) : (
                        <div className="single-tenant-card stc-vacant">
                          <div className="stc-vacant-content">
                            <div className="stc-details-grid" style={{ marginBottom: '1rem' }}>
                              <div className="stc-detail"><BedDouble size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Layout</span><span className="stc-detail-value">{unit.bedrooms} bed, {unit.bathrooms} bath{unit.sqft != null && unit.sqft > 0 ? ` · ${unit.sqft.toLocaleString()} sqft` : ''}</span></div></div>
                              <div className="stc-detail"><DollarSign size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Monthly rent</span><span className="stc-detail-value">{formatMoney(unit.monthlyRent)}</span></div></div>
                              {unit.deposit != null && unit.deposit > 0 && (<div className="stc-detail"><ShieldCheck size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Required deposit</span><span className="stc-detail-value">{formatMoney(unit.deposit)}</span></div></div>)}
                            </div>
                            <div className="stc-vacant-banner"><User size={18} /><div><strong>Vacant</strong><span>This property is ready for a new tenant.</span></div></div>
                            <div className="stc-actions">
                              <button type="button" className="btn primary" onClick={() => openAddTenant(unit.id, unit.monthlyRent, unit.deposit ?? 0)}><User size={14} /> Add tenant</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
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
                              <span> · Tenant: <strong><Link to={`/tenants/${tenant.id}`} className="tenant-link">{tenant.name}</Link></strong></span>
                              {tenant.phone && <span className="muted"> · {tenant.phone}</span>}
                              {tenant.email && <span className="muted"> · {tenant.email}</span>}
                            </span>
                            <span className="tenant-lease-dates muted block">
                              Lease: {formatDate(tenant.leaseStart)} — {formatDate(tenant.leaseEnd)}
                              {tenant.deposit != null && tenant.deposit > 0 && <> · Deposit held: {formatMoney(tenant.deposit)}</>}
                              {tenant.gracePeriodDays != null && tenant.gracePeriodDays > 0 && <> · Grace: {tenant.gracePeriodDays}d</>}
                              {tenant.lateFeeAmount != null && tenant.lateFeeAmount > 0 && <> · Late fee: {formatMoney(tenant.lateFeeAmount)}</>}
                              {tenant.autopay && <> · <span className="autopay-badge">Autopay</span></>}
                            </span>
                            {tenant.notes && <span className="muted block">Note: {tenant.notes}</span>}
                            {tenant.rentHistory && tenant.rentHistory.length > 0 && (
                              <span className="muted block">Rent history: {tenant.rentHistory.map((r, i) => <span key={i}>{formatDate(r.date)}: {formatMoney(r.oldRent)} → {formatMoney(r.newRent)}{i < tenant.rentHistory!.length - 1 ? ', ' : ''}</span>)}</span>
                            )}
                            {(() => { const s = getLeaseStatus(tenant.leaseEnd); if (s === 'expired') return <span className="badge expired">Lease expired</span>; if (s === 'expiring') return <span className="badge expiring">Lease expiring</span>; return <span className="badge active-lease">Active</span> })()}
                            <ReliabilityBadge tenant={tenant} payments={propPayments} graceDays={settings.defaultGracePeriodDays} />
                          </>
                        )}
                        {unit.available && !tenant && <span className="badge available">Available</span>}
                      </div>
                      <div className="row-actions">
                        <button type="button" className="btn small" onClick={() => setEditingUnitId(unit.id)}>Edit unit</button>
                        <button type="button" className="btn small" onClick={() => setNoteEntity({ type: 'unit', id: unit.id })}>Add note</button>
                        {!tenant && <button type="button" className="btn small danger" onClick={() => handleDeleteUnit(unit.id, unit.name)}>Delete unit</button>}
                        {!tenant && unit.available && <button type="button" className="btn small primary" onClick={() => openAddTenant(unit.id, unit.monthlyRent, unit.deposit ?? 0)}>Add tenant</button>}
                        {tenant && (
                          <>
                            <button type="button" className="btn small primary" onClick={() => openRecordPayment(tenant.id, tenant.monthlyRent)}>Record payment</button>
                            <button type="button" className="btn small" onClick={() => openEditTenant(tenant)}>Edit tenant</button>
                            <button type="button" className="btn small" onClick={() => setPaymentHistoryTenant(tenant.id)}>Payment history</button>
                            <button type="button" className="btn small" onClick={() => setNoteEntity({ type: 'tenant', id: tenant.id })}>Add note</button>
                            <button type="button" className="btn small" onClick={() => setShowMoveOut(tenant.id)}>Move out</button>
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
        return <MoveOutForm tenant={t} onClose={() => setShowMoveOut(null)} />
      })()}

      {showTenantForm && (
        <TenantForm
          propertyId={prop.id}
          unitName={propUnits.find((u) => u.id === tenantFormData.unitId)?.name}
          tenants={tenants}
          editingTenantId={editingTenantId}
          initial={tenantFormData}
          onClose={() => { setTenantFormUnitId(null); setEditingTenantId(null); setTenantFormData(null) }}
        />
      )}

      {paymentFormTenantId && (
        <RecordPaymentForm
          propertyId={prop.id}
          tenants={propTenants}
          payments={payments}
          initialTenantId={paymentFormTenantId}
          initialAmount={paymentInitial.amount}
          initialDate={paymentInitial.date}
          onClose={() => setPaymentFormTenantId(null)}
        />
      )}

      <RecentPayments payments={propPayments} tenants={tenants} onDelete={handleDeletePaymentClick} />
      <PropertyExpenses expenses={propExpenses} />
      <CommunicationLogSection propertyId={prop.id} tenants={propTenants} communicationLogs={communicationLogs} />
      <ActivityLogSection property={prop} units={propUnits} tenants={propTenants} activityLogs={propLogs} onAddNote={() => setNoteEntity({ type: 'property', id: prop.id })} />
      <section className="card section-card"><DocumentAttachments entityType="property" entityId={prop.id} /></section>

      {paymentHistoryTenant && (() => {
        const t = tenants.find((x) => x.id === paymentHistoryTenant)
        if (!t) return null
        return <PaymentHistoryModal tenant={t} payments={payments} onClose={() => setPaymentHistoryTenant(null)} />
      })()}
    </div>
  )
}

const GRADE_COLORS: Record<ReliabilityGrade, string> = {
  A: 'var(--positive)',
  B: '#4CAF50',
  C: '#FFC107',
  D: '#FF9800',
  F: 'var(--negative)',
}

function ReliabilityBadge({ tenant, payments, graceDays }: { tenant: Tenant; payments: Payment[]; graceDays: number }) {
  const r = getTenantReliability(tenant, payments, graceDays)
  return (
    <span className="reliability-badge" style={{ borderColor: GRADE_COLORS[r.grade] }} title={`Reliability: ${r.score}/100 — ${r.label}`}>
      <span className="reliability-grade" style={{ color: GRADE_COLORS[r.grade] }}>{r.grade}</span>
      <span className="reliability-label">{r.score}</span>
    </span>
  )
}
