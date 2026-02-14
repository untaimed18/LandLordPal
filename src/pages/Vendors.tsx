import { useState } from 'react'
import { useStore } from '../hooks/useStore'
import { addVendor, updateVendor, deleteVendor } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatPhoneNumber } from '../lib/format'

const SPECIALTIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'General Handyman',
  'Roofing',
  'Landscaping',
  'Pest Control',
  'Cleaning',
  'Painting',
  'Appliance Repair',
  'Flooring',
  'Locksmith',
  'Other',
]

const emptyForm = { name: '', phone: '', email: '', specialty: '', notes: '' }

export default function Vendors() {
  const toast = useToast()
  const confirm = useConfirm()
  const { vendors, maintenanceRequests, expenses } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  function openEdit(v: (typeof vendors)[0]) {
    setEditingId(v.id)
    setForm({ name: v.name, phone: v.phone ?? '', email: v.email ?? '', specialty: v.specialty ?? '', notes: v.notes ?? '' })
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingId) {
      updateVendor(editingId, {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        specialty: form.specialty || undefined,
        notes: form.notes || undefined,
      })
      setEditingId(null)
      toast('Vendor updated')
    } else {
      addVendor({
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        specialty: form.specialty || undefined,
        notes: form.notes || undefined,
      })
      toast('Vendor added')
    }
    setForm(emptyForm)
    setShowForm(false)
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: 'Delete vendor',
      message: `Delete vendor "${name}"?`,
      confirmText: 'Delete',
      danger: true,
    })
    if (ok) {
      deleteVendor(id)
      toast('Vendor deleted')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Vendors & Contractors</h1>
          <p className="page-desc">Manage your trusted service providers.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(!showForm) }}>
          {showForm ? 'Cancel' : '+ Add vendor'}
        </button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit vendor' : 'New vendor'}</h3>
          <div className="form-grid">
            <label>Name * <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Mike's Plumbing" /></label>
            <label>Phone <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="(555) 123-4567" /></label>
            <label>Email <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
            <label>Specialty <select value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}>
              <option value="">Select...</option>
              {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></label>
          </div>
          <label style={{ marginTop: '0.75rem' }}>Notes <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} /></label>
          <div className="form-actions">
            <button type="submit" className="btn primary">{editingId ? 'Save changes' : 'Add vendor'}</button>
          </div>
        </form>
      )}

      {vendors.length === 0 ? (
        <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
          <p className="empty-state-title">No vendors yet</p>
          <p className="empty-state-text">Add plumbers, electricians, and other contractors you work with regularly.</p>
        </div>
      ) : (
        <div className="vendor-grid">
          {vendors.map((v) => {
            const jobCount = maintenanceRequests.filter((r) => r.vendorId === v.id).length
            const expenseTotal = expenses.filter((e) => e.vendorId === v.id).reduce((s, e) => s + e.amount, 0)
            return (
              <div key={v.id} className="vendor-card card">
                <div className="vendor-card-header">
                  <h3>{v.name}</h3>
                  {v.specialty && <span className="badge">{v.specialty}</span>}
                </div>
                <div className="vendor-contact">
                  {v.phone && <span>📞 {v.phone}</span>}
                  {v.email && <span>✉ {v.email}</span>}
                </div>
                {v.notes && <p className="muted vendor-notes">{v.notes}</p>}
                <div className="vendor-stats muted">
                  {jobCount > 0 && <span>{jobCount} maintenance job{jobCount !== 1 ? 's' : ''}</span>}
                  {expenseTotal > 0 && <span>Total spent: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(expenseTotal)}</span>}
                </div>
                <div className="vendor-actions">
                  <button type="button" className="btn small" onClick={() => openEdit(v)}>Edit</button>
                  <button type="button" className="btn small danger" onClick={() => handleDelete(v.id, v.name)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
