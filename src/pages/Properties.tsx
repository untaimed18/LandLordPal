import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { getPropertySummary } from '../lib/calculations'
import { addProperty, updateProperty, deleteProperty, takeSnapshot, restoreSnapshot } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatMoney, formatDate } from '../lib/format'
import { US_STATES } from '../lib/us-states'
import { Home } from 'lucide-react'
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
    insuranceProvider: '',
    insurancePolicyNumber: '',
    insuranceExpiry: '',
    notes: '',
  })

  const summaries = properties.map((p) =>
    getPropertySummary(p, units, tenants, expenses, payments)
  )

  function openEdit(property: (typeof properties)[0]) {
    setEditingId(property.id)
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
      insuranceProvider: property.insuranceProvider ?? '',
      insurancePolicyNumber: property.insurancePolicyNumber ?? '',
      insuranceExpiry: property.insuranceExpiry ?? '',
      notes: property.notes ?? '',
    })
    setShowForm(true)
  }

  const emptyForm = { name: '', address: '', city: '', state: '', zip: '', propertyType: '', sqft: 0, amenities: [] as string[], purchasePrice: 0, purchaseDate: '', insuranceProvider: '', insurancePolicyNumber: '', insuranceExpiry: '', notes: '' }

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
      setEditingId(null)
      toast('Property updated')
    } else {
      addProperty(data)
      toast('Property added')
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

      <div className="table-wrap">
        {properties.length === 0 ? (
          !showForm ? (
            <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
              <div className="empty-icon"><Home size={32} /></div>
              <p className="empty-state-title">No properties yet</p>
              <p className="empty-state-text">Add your first rental property to start tracking units, tenants, and income.</p>
            </div>
          ) : null
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Address</th>
                <th>Units</th>
                <th>Monthly rent</th>
                <th>Collected (month)</th>
                <th>Expenses (month)</th>
                <th>Net</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.property.id}>
                  <td>
                    <Link to={`/properties/${s.property.id}`} className="link-strong">
                      {s.property.name}
                    </Link>
                    {s.property.propertyType && (
                      <span className="muted block">{PROPERTY_TYPES.find((t) => t.value === s.property.propertyType)?.label}{s.property.sqft ? ` · ${s.property.sqft.toLocaleString()} sqft` : ''}</span>
                    )}
                    {s.property.purchasePrice != null && s.property.purchasePrice > 0 && (
                      <span className="muted block">Purchased: {formatMoney(s.property.purchasePrice)}{s.property.purchaseDate ? ` (${formatDate(s.property.purchaseDate)})` : ''}</span>
                    )}
                  </td>
                  <td>{s.property.address}, {s.property.city}</td>
                  <td>{s.occupiedUnits} / {s.unitCount}</td>
                  <td>{formatMoney(s.totalMonthlyRent)}</td>
                  <td className="positive">{formatMoney(s.collectedThisMonth)}</td>
                  <td className="negative">{formatMoney(s.expensesThisMonth)}</td>
                  <td className={s.netThisMonth >= 0 ? 'positive' : 'negative'}>
                    {formatMoney(s.netThisMonth)}
                  </td>
                  <td className="actions-cell">
                    <Link to={`/properties/${s.property.id}`} className="btn small">View</Link>
                    <button type="button" className="btn small" onClick={() => openEdit(s.property)}>Edit</button>
                    <button type="button" className="btn small danger" onClick={() => handleDelete(s.property.id, s.property.name)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
