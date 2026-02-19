import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { getPropertySummary } from '../lib/calculations'
import { addProperty, addUnit, updateUnit, updateProperty, deleteProperty, takeSnapshot, restoreSnapshot } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatMoney, formatDate } from '../lib/format'
import { US_STATES } from '../lib/us-states'
import { Home, MapPin, Building2, DoorOpen, TrendingUp, TrendingDown, Pencil, Trash2, Eye, Shield, UserPlus } from 'lucide-react'
import type { PropertyType } from '../types'

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

const SINGLE_UNIT_TYPES: PropertyType[] = ['single_family', 'condo', 'townhouse']

function isSingleUnitType(type: string): boolean {
  return SINGLE_UNIT_TYPES.includes(type as PropertyType)
}

function formatNumberWithCommas(value: string): string {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

export default function Properties() {
  const toast = useToast()
  const confirm = useConfirm()
  const { properties, units, tenants, expenses, payments } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    propertyType: '' as string,
    sqft: 0,
    amenities: [] as string[],
    purchasePrice: 0,
    purchaseDate: '',
    monthlyRent: 0,
    deposit: 0,
    bedrooms: 0,
    bathrooms: 0,
    insuranceProvider: '',
    insurancePolicyNumber: '',
    insuranceExpiry: '',
    notes: '',
  })

  const summaries = useMemo(() =>
    properties.map((p) => getPropertySummary(p, units, tenants, expenses, payments)),
    [properties, units, tenants, expenses, payments]
  )

  function openEdit(property: (typeof properties)[0]) {
    setEditingId(property.id)
    const propUnit = units.find((u) => u.propertyId === property.id)
    setForm({
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
      propertyType: property.propertyType ?? '',
      sqft: property.sqft ?? 0,
      amenities: property.amenities ?? [],
      purchasePrice: property.purchasePrice ?? 0,
      purchaseDate: property.purchaseDate ?? '',
      monthlyRent: propUnit?.monthlyRent ?? 0,
      deposit: propUnit?.deposit ?? 0,
      bedrooms: propUnit?.bedrooms ?? 0,
      bathrooms: propUnit?.bathrooms ?? 0,
      insuranceProvider: property.insuranceProvider ?? '',
      insurancePolicyNumber: property.insurancePolicyNumber ?? '',
      insuranceExpiry: property.insuranceExpiry ?? '',
      notes: property.notes ?? '',
    })
    setShowForm(true)
  }

  const emptyForm = { name: '', address: '', city: '', state: '', zip: '', propertyType: '', sqft: 0, amenities: [] as string[], purchasePrice: 0, purchaseDate: '', monthlyRent: 0, deposit: 0, bedrooms: 0, bathrooms: 0, insuranceProvider: '', insurancePolicyNumber: '', insuranceExpiry: '', notes: '' }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data = {
      name: form.name,
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      propertyType: (form.propertyType as PropertyType) || undefined,
      sqft: form.sqft || undefined,
      amenities: form.amenities.length > 0 ? form.amenities : undefined,
      purchasePrice: form.purchasePrice || undefined,
      purchaseDate: form.purchaseDate || undefined,
      insuranceProvider: form.insuranceProvider || undefined,
      insurancePolicyNumber: form.insurancePolicyNumber || undefined,
      insuranceExpiry: form.insuranceExpiry || undefined,
      notes: form.notes || undefined,
    }
    if (editingId) {
      updateProperty(editingId, data)
      // If single-unit type, also update the unit's rent/deposit/beds/baths
      if (isSingleUnitType(form.propertyType)) {
        const existingUnit = units.find((u) => u.propertyId === editingId)
        if (existingUnit) {
          updateUnit(existingUnit.id, {
            monthlyRent: form.monthlyRent || 0,
            deposit: form.deposit || undefined,
            bedrooms: form.bedrooms || 0,
            bathrooms: form.bathrooms || 0,
            sqft: form.sqft || undefined,
          })
        }
      }
      setEditingId(null)
      toast('Property updated')
    } else {
      const newProperty = addProperty(data)
      // Auto-create a default unit for single-unit property types
      if (isSingleUnitType(form.propertyType)) {
        addUnit({
          propertyId: newProperty.id,
          name: form.name,
          bedrooms: form.bedrooms || 0,
          bathrooms: form.bathrooms || 0,
          monthlyRent: form.monthlyRent || 0,
          sqft: form.sqft || undefined,
          deposit: form.deposit || undefined,
          available: true,
        })
        toast('Property added with unit ready for a tenant')
      } else {
        toast('Property added')
      }
    }
    setForm(emptyForm)
    setShowForm(false)
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: 'Delete property',
      message: `Delete "${name}"? This will also remove all units, tenants, expenses, and payments for this property.`,
      confirmText: 'Delete',
      danger: true,
    })
    if (ok) {
      const snap = takeSnapshot()
      deleteProperty(id)
      if (editingId === id) {
        setEditingId(null)
        setShowForm(false)
      }
      toast('Property deleted', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); toast('Property restored', 'info') } } })
    }
  }

  return (
    <div className="page properties-page">
      <div className="page-header">
        <div>
          <h1>Properties</h1>
          <p className="page-desc">Manage addresses, units, and tenants.</p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setEditingId(null)
            setForm(emptyForm)
            setShowForm(!showForm)
          }}
        >
          {showForm ? 'Cancel' : '+ Add property'}
        </button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit property' : 'New property'}</h3>
          <div className="form-grid">
            <label>Name * <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Oak Street Duplex" /></label>
            <label>Address * <input required value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Oak St" /></label>
            <label>City * <input required value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Austin" /></label>
            <label>State * <select required value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}>
              <option value="">Select state</option>
              {US_STATES.map((s) => <option key={s.value} value={s.value}>{s.value} — {s.label}</option>)}
            </select></label>
            <label>ZIP * <input required pattern="\d{5}(-\d{4})?" title="5-digit ZIP or ZIP+4 (e.g. 78701 or 78701-1234)" value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} placeholder="78701" /></label>
            <label>Property type <select value={form.propertyType} onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))}>
              <option value="">Select type</option>
              {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select></label>
            <label>Total sq ft <input type="number" min={0} value={form.sqft || ''} onChange={(e) => setForm((f) => ({ ...f, sqft: +e.target.value || 0 }))} placeholder="e.g. 2400" /></label>
            <label>Purchase price <input type="text" inputMode="numeric" value={form.purchasePrice ? formatNumberWithCommas(String(form.purchasePrice)) : ''} onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ''); setForm((f) => ({ ...f, purchasePrice: raw ? Number(raw) : 0 })) }} placeholder="350,000" /></label>
            <label>Purchase date <input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} /></label>
          </div>

          {isSingleUnitType(form.propertyType) && (
            <fieldset className="form-fieldset" style={{ marginTop: '0.75rem' }}>
              <legend>Rent &amp; unit details</legend>
              <div className="form-grid">
                <label>Monthly rent * <input type="text" inputMode="numeric" required={isSingleUnitType(form.propertyType)} value={form.monthlyRent ? formatNumberWithCommas(String(form.monthlyRent)) : ''} onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ''); setForm((f) => ({ ...f, monthlyRent: raw ? Number(raw) : 0 })) }} placeholder="1,200" /></label>
                <label>Security deposit <input type="text" inputMode="numeric" value={form.deposit ? formatNumberWithCommas(String(form.deposit)) : ''} onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ''); setForm((f) => ({ ...f, deposit: raw ? Number(raw) : 0 })) }} placeholder="1,200" /></label>
                <label>Bedrooms <input type="number" min={0} value={form.bedrooms || ''} onChange={(e) => setForm((f) => ({ ...f, bedrooms: +e.target.value || 0 }))} placeholder="3" /></label>
                <label>Bathrooms <input type="number" min={0} step={0.5} value={form.bathrooms || ''} onChange={(e) => setForm((f) => ({ ...f, bathrooms: +e.target.value || 0 }))} placeholder="2" /></label>
              </div>
            </fieldset>
          )}

          <div style={{ marginTop: '0.75rem' }}>
            <label>Amenities</label>
            <div className="amenity-chips">
              {COMMON_AMENITIES.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`amenity-chip ${form.amenities.includes(a) ? 'active' : ''}`}
                  onClick={() => setForm((f) => ({
                    ...f,
                    amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a],
                  }))}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <fieldset className="form-fieldset" style={{ marginTop: '0.75rem' }}>
            <legend>Insurance (optional)</legend>
            <div className="form-grid">
              <label>Provider <input value={form.insuranceProvider} onChange={(e) => setForm((f) => ({ ...f, insuranceProvider: e.target.value }))} placeholder="e.g. State Farm" /></label>
              <label>Policy # <input value={form.insurancePolicyNumber} onChange={(e) => setForm((f) => ({ ...f, insurancePolicyNumber: e.target.value }))} placeholder="Policy number" /></label>
              <label>Expiry date <input type="date" value={form.insuranceExpiry} onChange={(e) => setForm((f) => ({ ...f, insuranceExpiry: e.target.value }))} /></label>
            </div>
          </fieldset>
          <label style={{ marginTop: '0.75rem' }}>Notes <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" rows={2} /></label>
          <div className="form-actions">
            <button type="submit" className="btn primary">{editingId ? 'Save changes' : 'Save property'}</button>
          </div>
        </form>
      )}

      {properties.length === 0 ? (
        !showForm ? (
          <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
            <div className="empty-icon"><Home size={32} /></div>
            <p className="empty-state-title">No properties yet</p>
            <p className="empty-state-text">Add your first rental property to start tracking units, tenants, and income.</p>
          </div>
        ) : null
      ) : (
        <div className="prop-list">
          {summaries.map((s) => {
            const p = s.property
            const typeLabel = PROPERTY_TYPES.find((t) => t.value === p.propertyType)?.label
            const occupancyPct = s.unitCount > 0 ? Math.round((s.occupiedUnits / s.unitCount) * 100) : 0
            const isVacant = s.unitCount > 0 && s.occupiedUnits === 0
            const isSingle = isSingleUnitType(p.propertyType ?? '')
            return (
              <div key={p.id} className="prop-card card">
                <div className="prop-card-top">
                  <div className="prop-card-info">
                    <Link to={`/properties/${p.id}`} className="prop-card-name">{p.name}</Link>
                    <div className="prop-card-meta">
                      <span className="prop-card-address"><MapPin size={13} /> {p.address}, {p.city}, {p.state} {p.zip}</span>
                      {typeLabel && (
                        <span className="prop-card-type-badge">
                          <Building2 size={12} /> {typeLabel}{p.sqft ? ` · ${p.sqft.toLocaleString()} sqft` : ''}
                        </span>
                      )}
                    </div>
                    {p.amenities && p.amenities.length > 0 && (
                      <div className="prop-card-amenities">
                        {p.amenities.slice(0, 5).map((a) => <span key={a} className="amenity-chip active small">{a}</span>)}
                        {p.amenities.length > 5 && <span className="amenity-chip small">+{p.amenities.length - 5}</span>}
                      </div>
                    )}
                  </div>
                  <div className="prop-card-actions">
                    {isVacant && (
                      <Link to={`/properties/${p.id}?addTenant=1`} className="btn small accent" title="Add a tenant"><UserPlus size={14} /> Add tenant</Link>
                    )}
                    <Link to={`/properties/${p.id}`} className="btn small" title="View details"><Eye size={14} /> View</Link>
                    <button type="button" className="btn small" onClick={() => openEdit(p)} title="Edit property"><Pencil size={14} /> Edit</button>
                    <button type="button" className="btn small danger" onClick={() => handleDelete(p.id, p.name)} title="Delete property"><Trash2 size={14} /></button>
                  </div>
                </div>

                <div className="prop-card-stats">
                  <div className="prop-stat">
                    <span className="prop-stat-label"><DoorOpen size={13} /> Status</span>
                    {isSingle ? (
                      <span className={`prop-stat-value ${s.occupiedUnits > 0 ? 'positive' : 'negative'}`}>
                        {s.occupiedUnits > 0 ? 'Occupied' : 'Vacant'}
                      </span>
                    ) : (
                      <>
                        <span className="prop-stat-value">{s.occupiedUnits} / {s.unitCount}</span>
                        <div className="occupancy-bar"><div className="occupancy-fill" style={{ width: `${occupancyPct}%` }} /></div>
                      </>
                    )}
                  </div>
                  <div className="prop-stat">
                    <span className="prop-stat-label">Monthly rent</span>
                    <span className="prop-stat-value">{formatMoney(s.totalMonthlyRent)}</span>
                  </div>
                  <div className="prop-stat">
                    <span className="prop-stat-label"><TrendingUp size={13} /> Collected</span>
                    <span className="prop-stat-value positive">{formatMoney(s.collectedThisMonth)}</span>
                  </div>
                  <div className="prop-stat">
                    <span className="prop-stat-label"><TrendingDown size={13} /> Expenses</span>
                    <span className="prop-stat-value negative">{formatMoney(s.expensesThisMonth)}</span>
                  </div>
                  <div className={`prop-stat prop-stat-net ${s.netThisMonth >= 0 ? 'net-positive' : 'net-negative'}`}>
                    <span className="prop-stat-label">Net</span>
                    <span className="prop-stat-value">{formatMoney(s.netThisMonth)}</span>
                  </div>
                </div>

                {(p.purchasePrice || p.insuranceProvider) && (
                  <div className="prop-card-footer">
                    {p.purchasePrice != null && p.purchasePrice > 0 && (
                      <span className="prop-footer-item">Purchased: {formatMoney(p.purchasePrice)}{p.purchaseDate ? ` (${formatDate(p.purchaseDate)})` : ''}</span>
                    )}
                    {p.insuranceProvider && (
                      <span className="prop-footer-item"><Shield size={12} /> {p.insuranceProvider}{p.insuranceExpiry ? ` · Exp ${formatDate(p.insuranceExpiry)}` : ''}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
