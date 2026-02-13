import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { getPropertySummary } from '../lib/calculations'
import { addProperty, updateProperty, deleteProperty } from '../store'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatDate } from '../lib/format'
import { US_STATES } from '../lib/us-states'

function formatNumberWithCommas(value: string): string {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

export default function Properties() {
  const toast = useToast()
  const { properties, units, tenants, expenses, payments } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    purchasePrice: 0,
    purchaseDate: '',
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
      purchasePrice: property.purchasePrice ?? 0,
      purchaseDate: property.purchaseDate ?? '',
      notes: property.notes ?? '',
    })
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data = {
      name: form.name,
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      purchasePrice: form.purchasePrice || undefined,
      purchaseDate: form.purchaseDate || undefined,
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
    setForm({ name: '', address: '', city: '', state: '', zip: '', purchasePrice: 0, purchaseDate: '', notes: '' })
    setShowForm(false)
  }

  function handleDelete(id: string, name: string) {
    if (window.confirm(`Delete property "${name}"? This will also remove all units, tenants, expenses, and payments for this property.`)) {
      deleteProperty(id)
      if (editingId === id) {
        setEditingId(null)
        setShowForm(false)
      }
      toast('Property deleted')
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
            setForm({ name: '', address: '', city: '', state: '', zip: '', purchasePrice: 0, purchaseDate: '', notes: '' })
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
            <label>ZIP * <input required value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} placeholder="78701" /></label>
            <label>Purchase price <input type="text" inputMode="numeric" value={form.purchasePrice ? formatNumberWithCommas(String(form.purchasePrice)) : ''} onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ''); setForm((f) => ({ ...f, purchasePrice: raw ? Number(raw) : 0 })) }} placeholder="350,000" /></label>
            <label>Purchase date <input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} /></label>
          </div>
          <label>Notes <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" rows={2} /></label>
          <div className="form-actions">
            <button type="submit" className="btn primary">{editingId ? 'Save changes' : 'Save property'}</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        {properties.length === 0 ? (
          !showForm ? (
            <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
              <div className="empty-icon">🏠</div>
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
