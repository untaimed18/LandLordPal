import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { addMaintenanceRequest, updateMaintenanceRequest, deleteMaintenanceRequest, takeSnapshot, restoreSnapshot } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatMoney, formatDate } from '../lib/format'
import { nowISO } from '../lib/id'
import type { MaintenancePriority, MaintenanceStatus, MaintenanceCategory, MaintenanceRecurrence } from '../types'
import { usePagination } from '../hooks/usePagination'
import Pagination from '../components/Pagination'
import { Wrench } from 'lucide-react'
import { useFormValidation } from '../hooks/useFormValidation'
import { maintenanceSchema } from '../lib/schemas'

const PRIORITIES: { value: MaintenancePriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'emergency', label: 'Emergency' },
]

const STATUSES: { value: MaintenanceStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

const CATEGORIES: { value: MaintenanceCategory; label: string }[] = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'structural', label: 'Structural' },
  { value: 'pest', label: 'Pest Control' },
  { value: 'other', label: 'Other' },
]

const RECURRENCES: { value: MaintenanceRecurrence; label: string }[] = [
  { value: 'none', label: 'One-time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi_annual', label: 'Every 6 months' },
  { value: 'annual', label: 'Annually' },
]

const emptyForm = {
  propertyId: '',
  unitId: '',
  tenantId: '',
  title: '',
  description: '',
  priority: 'medium' as MaintenancePriority,
  category: 'other' as MaintenanceCategory,
  cost: 0,
  scheduledDate: '',
  recurrence: 'none' as MaintenanceRecurrence,
  notes: '',
}

export default function Maintenance() {
  const toast = useToast()
  const confirm = useConfirm()
  const { properties, units, tenants, maintenanceRequests } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('open,in_progress')
  const [filterProperty, setFilterProperty] = useState('')
  const [form, setForm] = useState(emptyForm)

  const filtered = maintenanceRequests.filter((r) => {
    if (filterStatus && !filterStatus.split(',').includes(r.status)) return false
    if (filterProperty && r.propertyId !== filterProperty) return false
    return true
  }).sort((a, b) => {
    const pOrder = { emergency: 0, high: 1, medium: 2, low: 3 }
    if (a.status !== b.status) {
      const sOrder = { open: 0, in_progress: 1, completed: 2 }
      return (sOrder[a.status] ?? 9) - (sOrder[b.status] ?? 9)
    }
    return (pOrder[a.priority] ?? 9) - (pOrder[b.priority] ?? 9)
  })
  const pagination = usePagination(filtered)

  const openCount = maintenanceRequests.filter((r) => r.status === 'open').length
  const inProgressCount = maintenanceRequests.filter((r) => r.status === 'in_progress').length

  const propUnits = form.propertyId ? units.filter((u) => u.propertyId === form.propertyId) : []
  const propTenants = form.propertyId ? tenants.filter((t) => t.propertyId === form.propertyId) : []

  function openEdit(req: (typeof maintenanceRequests)[0]) {
    setEditingId(req.id)
    setForm({
      propertyId: req.propertyId,
      unitId: req.unitId ?? '',
      tenantId: req.tenantId ?? '',
      title: req.title,
      description: req.description,
      priority: req.priority,
      category: req.category,
      cost: req.cost ?? 0,
      scheduledDate: req.scheduledDate ?? '',
      recurrence: req.recurrence ?? 'none',
      notes: req.notes ?? '',
    })
    setShowForm(true)
  }

  const { errors: formErrors, validate: validateMaintenance, clearError } = useFormValidation(maintenanceSchema)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.propertyId) return
    const payload = {
      propertyId: form.propertyId,
      unitId: form.unitId || undefined,
      tenantId: form.tenantId || undefined,
      title: form.title,
      description: form.description,
      priority: form.priority,
      status: editingId ? (maintenanceRequests.find((r) => r.id === editingId)?.status ?? 'open') : 'open',
      category: form.category,
      cost: form.cost || undefined,
      scheduledDate: form.scheduledDate || undefined,
      recurrence: form.recurrence !== 'none' ? form.recurrence : undefined,
      notes: form.notes || undefined,
    }
    if (!validateMaintenance(payload)) return
    try {
      if (editingId) {
        await updateMaintenanceRequest(editingId, payload)
        setEditingId(null)
        toast('Request updated')
      } else {
        await addMaintenanceRequest(payload)
        toast('Request created')
      }
      setForm(emptyForm)
      setShowForm(false)
    } catch {
      toast('Failed to save request', 'error')
    }
  }

  async function handleStatusChange(id: string, status: MaintenanceStatus) {
    const request = maintenanceRequests.find(r => r.id === id)
    await updateMaintenanceRequest(id, {
      status,
      resolvedAt: status === 'completed' ? nowISO() : undefined,
    })
    toast(`Marked as ${STATUSES.find((s) => s.value === status)?.label}`)

    if (status === 'completed' && request?.recurrence && request.recurrence !== 'none') {
      const baseDate = request.scheduledDate ? new Date(request.scheduledDate + 'T12:00:00') : new Date()
      const next = new Date(baseDate)
      switch (request.recurrence) {
        case 'monthly': next.setMonth(next.getMonth() + 1); break
        case 'quarterly': next.setMonth(next.getMonth() + 3); break
        case 'semi_annual': next.setMonth(next.getMonth() + 6); break
        case 'annual': next.setFullYear(next.getFullYear() + 1); break
      }
      const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
      await addMaintenanceRequest({
        propertyId: request.propertyId,
        unitId: request.unitId,
        tenantId: request.tenantId,
        title: request.title,
        description: request.description,
        priority: request.priority,
        status: 'open',
        category: request.category,
        vendorId: request.vendorId,
        scheduledDate: nextDate,
        recurrence: request.recurrence,
        notes: request.notes,
      })
      toast(`Next ${request.recurrence} occurrence scheduled for ${nextDate}`, 'info')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Maintenance</h1>
          <p className="page-desc">Track repair requests and maintenance issues.</p>
        </div>
        {properties.length > 0 && (
          <button type="button" className="btn primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(!showForm) }}>
            {showForm ? 'Cancel' : '+ New request'}
          </button>
        )}
      </div>

      {properties.length === 0 && (
        <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
          <div className="empty-icon"><Wrench size={32} /></div>
          <p className="empty-state-title">No maintenance requests yet</p>
          <p className="empty-state-text">Add a property first, then create maintenance requests to track repairs and issues.</p>
          <Link to="/properties" className="btn primary">Go to properties</Link>
        </div>
      )}

      {properties.length > 0 && (
        <div className="stats-grid two" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <span className="stat-label">Open requests</span>
            <span className={`stat-value ${openCount > 0 ? 'negative' : ''}`}>{openCount}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">In progress</span>
            <span className="stat-value">{inProgressCount}</span>
          </div>
        </div>
      )}

      {showForm && properties.length > 0 && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit request' : 'New maintenance request'}</h3>
          <div className="form-grid">
            <label>Property * <select required value={form.propertyId} onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value, unitId: '', tenantId: '' }))}>
              <option value="">Select property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
            <label>Unit <select value={form.unitId} onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}>
              <option value="">Property-wide</option>
              {propUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select></label>
            <label>Reported by <select value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}>
              <option value="">N/A</option>
              {propTenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
            <label>Priority * <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as MaintenancePriority }))}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select></label>
            <label>Category * <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as MaintenanceCategory }))}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select></label>
            <label>Est. cost <input type="number" min={0} step={0.01} value={form.cost || ''} onChange={(e) => setForm((f) => ({ ...f, cost: +e.target.value }))} /></label>
            <label>Scheduled date <input type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} /></label>
            <label>Recurrence <select value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as MaintenanceRecurrence }))}>
              {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select></label>
          </div>
          <label className={formErrors.title ? 'form-field-error' : ''}>Title * <input required value={form.title} onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); clearError('title') }} placeholder="e.g. Leaky faucet in kitchen" />{formErrors.title && <span className="field-error" role="alert">{formErrors.title}</span>}</label>
          <label className={formErrors.description ? 'form-field-error' : ''} style={{ marginTop: '0.75rem' }}>Description * <textarea value={form.description} onChange={(e) => { setForm((f) => ({ ...f, description: e.target.value })); clearError('description') }} rows={3} placeholder="Details about the issue..." />{formErrors.description && <span className="field-error" role="alert">{formErrors.description}</span>}</label>
          <label style={{ marginTop: '0.75rem' }}>Notes <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Internal notes" /></label>
          <div className="form-actions">
            <button type="submit" className="btn primary">{editingId ? 'Save changes' : 'Create request'}</button>
          </div>
        </form>
      )}

      {maintenanceRequests.length > 0 && (
        <div className="filter-bar">
          <label>
            <span className="label-text">Status</span>
            <select className="select-inline" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="open,in_progress">Active (Open + In Progress)</option>
              <option value="open">Open only</option>
              <option value="in_progress">In Progress only</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>
            <span className="label-text">Property</span>
            <select className="select-inline" value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)}>
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
      )}

      {maintenanceRequests.length > 0 && filtered.length === 0 && (
        <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
          <div className="empty-icon"><Wrench size={32} /></div>
          <p className="empty-state-title">No matching requests</p>
          <p className="empty-state-text">Try adjusting your status or property filters to see more results.</p>
          <button type="button" className="btn" onClick={() => { setFilterStatus(''); setFilterProperty('') }}>Clear all filters</button>
        </div>
      )}

      {maintenanceRequests.length === 0 && properties.length > 0 && !showForm && (
        <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
          <div className="empty-icon"><Wrench size={32} /></div>
          <p className="empty-state-title">No maintenance requests</p>
          <p className="empty-state-text">When a repair or maintenance issue comes up, create a request here to track it through completion.</p>
          <button type="button" className="btn primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true) }}>+ Create your first request</button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Title</th><th>Property / Unit</th><th>Priority</th><th>Category</th><th>Status</th><th>Cost</th><th>Scheduled</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {pagination.paged.map((r) => {
                const prop = properties.find((p) => p.id === r.propertyId)
                const unit = r.unitId ? units.find((u) => u.id === r.unitId) : null
                return (
                  <tr key={r.id}>
                    <td><strong>{r.title}</strong>{r.description && <span className="muted block">{r.description.slice(0, 60)}{r.description.length > 60 ? '...' : ''}</span>}</td>
                    <td>{prop?.name ?? '—'}{unit && <span className="muted"> — {unit.name}</span>}</td>
                    <td><span className={`badge priority-${r.priority}`}>{PRIORITIES.find((p) => p.value === r.priority)?.label}</span></td>
                    <td>{CATEGORIES.find((c) => c.value === r.category)?.label}</td>
                    <td>
                      <select className="select-inline select-compact" value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value as MaintenanceStatus)}>
                        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td>{r.cost ? formatMoney(r.cost) : '—'}</td>
                    <td>{r.scheduledDate ? formatDate(r.scheduledDate) : '—'}{r.recurrence && r.recurrence !== 'none' && <span className="muted block">{RECURRENCES.find((x) => x.value === r.recurrence)?.label}</span>}</td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td className="actions-cell">
                      <button type="button" className="btn small" onClick={() => openEdit(r)}>Edit</button>
                      <button type="button" className="btn small danger" onClick={async () => { if (await confirm({ title: 'Delete request', message: `Delete "${r.title}"?`, confirmText: 'Delete', danger: true })) { const snap = takeSnapshot(); try { await deleteMaintenanceRequest(r.id); toast('Request deleted', { action: { label: 'Undo', onClick: async () => { try { await restoreSnapshot(snap); toast('Request restored', 'info') } catch { toast('Undo failed', 'error') } } } }) } catch { toast('Failed to delete request', 'error') } } }}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > 0 && <Pagination pagination={pagination} />}
    </div>
  )
}
