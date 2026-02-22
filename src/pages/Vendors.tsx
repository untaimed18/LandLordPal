import { useState } from 'react'
import { useStore } from '../hooks/useStore'
import { addVendor, updateVendor, deleteVendor, takeSnapshot, restoreSnapshot } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatPhoneNumber, formatMoney } from '../lib/format'
import { vendorSchema, extractErrors } from '../lib/schemas'
import type { ValidationErrors } from '../lib/schemas'
import { Phone, Mail, Users } from 'lucide-react'

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
  const [formErrors, setFormErrors] = useState<ValidationErrors>({})

  function openEdit(v: (typeof vendors)[0]) {
    setEditingId(v.id)
    setForm({ name: v.name, phone: v.phone ?? '', email: v.email ?? '', specialty: v.specialty ?? '', notes: v.notes ?? '' })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data = {
      name: form.name,
      phone: form.phone || undefined,
      email: form.email || undefined,
      specialty: form.specialty || undefined,
      notes: form.notes || undefined,
    }
    const result = vendorSchema.safeParse(data)
    if (!result.success) {
      setFormErrors(extractErrors(result.error))
      return
    }
    setFormErrors({})
    try {
      if (editingId) {
        await updateVendor(editingId, data)
        setEditingId(null)
        toast('Vendor updated')
      } else {
        await addVendor(data)
        toast('Vendor added')
      }
      setForm(emptyForm)
      setShowForm(false)
    } catch {
      toast('Failed to save vendor', 'error')
    }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: 'Delete vendor',
      message: `Delete vendor "${name}"?`,
      confirmText: 'Delete',
      danger: true,
    })
    if (ok) {
      const snap = takeSnapshot()
      try {
        await deleteVendor(id)
        toast('Vendor deleted', { action: { label: 'Undo', onClick: async () => { try { await restoreSnapshot(snap); toast('Vendor restored', 'info') } catch { toast('Undo failed', 'error') } } } })
      } catch {
        toast('Failed to delete vendor', 'error')
      }
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
            <label className={formErrors.name ? 'form-field-error' : ''}>Name * <input required value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setFormErrors((p) => { const n = { ...p }; delete n.name; return n }) }} placeholder="e.g. Mike's Plumbing" />{formErrors.name && <span className="field-error" role="alert">{formErrors.name}</span>}</label>
            <label className={formErrors.phone ? 'form-field-error' : ''}>Phone <input type="tel" value={form.phone} onChange={(e) => { setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) })); setFormErrors((p) => { const n = { ...p }; delete n.phone; return n }) }} placeholder="(555) 123-4567" />{formErrors.phone && <span className="field-error" role="alert">{formErrors.phone}</span>}</label>
            <label className={formErrors.email ? 'form-field-error' : ''}>Email <input type="email" value={form.email} onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setFormErrors((p) => { const n = { ...p }; delete n.email; return n }) }} />{formErrors.email && <span className="field-error" role="alert">{formErrors.email}</span>}</label>
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
          <div className="empty-icon"><Users size={32} /></div>
          <p className="empty-state-title">No vendors or contractors yet</p>
          <p className="empty-state-text">Keep a directory of plumbers, electricians, handymen, and other contractors you work with. Link them to maintenance requests and expenses for easy tracking.</p>
          <button type="button" className="btn primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true) }}>+ Add your first vendor</button>
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
                  {v.phone && <span><Phone size={13} style={{ verticalAlign: 'text-bottom', marginRight: 3 }} />{v.phone}</span>}
                  {v.email && <span><Mail size={13} style={{ verticalAlign: 'text-bottom', marginRight: 3 }} />{v.email}</span>}
                </div>
                {v.notes && <p className="muted vendor-notes">{v.notes}</p>}
                <div className="vendor-stats muted">
                  {jobCount > 0 && <span>{jobCount} maintenance job{jobCount !== 1 ? 's' : ''}</span>}
                  {expenseTotal > 0 && <span>Total spent: {formatMoney(expenseTotal)}</span>}
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
