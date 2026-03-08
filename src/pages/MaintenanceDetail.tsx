import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { addMaintenanceRequest, updateMaintenanceRequest, deleteMaintenanceRequest, takeSnapshot, restoreSnapshot } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatMoney, formatDate } from '../lib/format'
import { nowISO } from '../lib/id'
import { getNextRecurringDate } from '../lib/calculations'
import { exportWorkOrderPdf } from '../lib/pdfExport'
import Breadcrumbs from '../components/Breadcrumbs'
import DocumentAttachments from '../components/DocumentAttachments'
import MaintenancePhotos from '../components/MaintenancePhotos'
import type { MaintenanceStatus, MaintenancePhoto } from '../types'
import { Wrench, User, Home, MapPin, Clock, DollarSign, CalendarDays, CheckCircle, Play, Printer, Trash2 } from 'lucide-react'

const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', emergency: 'Emergency' }
const STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed' }
const CATEGORY_LABELS: Record<string, string> = { plumbing: 'Plumbing', electrical: 'Electrical', hvac: 'HVAC', appliance: 'Appliance', structural: 'Structural', pest: 'Pest Control', other: 'Other' }

export default function MaintenanceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { maintenanceRequests, properties, units, tenants, vendors } = useStore()
  const [editingCost, setEditingCost] = useState(false)
  const [actualCostInput, setActualCostInput] = useState('')

  const request = maintenanceRequests.find((r) => r.id === id)
  const property = request ? properties.find((p) => p.id === request.propertyId) : null
  const unit = request?.unitId ? units.find((u) => u.id === request.unitId) : null
  const tenant = request?.tenantId ? tenants.find((t) => t.id === request.tenantId) : null
  const vendor = request?.vendorId ? vendors.find((v) => v.id === request.vendorId) : null

  const timeline = useMemo(() => {
    if (!request) return []
    const events: { date: string; type: string; detail: string; icon: 'create' | 'status' | 'vendor' | 'resolve' }[] = []
    events.push({ date: request.createdAt, type: 'Created', detail: `Request created — ${PRIORITY_LABELS[request.priority]} priority`, icon: 'create' })
    if (request.statusHistory) {
      for (const entry of request.statusHistory) {
        if (entry.status === 'open' && entry.date === request.createdAt) continue
        events.push({
          date: entry.date,
          type: 'Status Changed',
          detail: `Status changed to ${STATUS_LABELS[entry.status] ?? entry.status}${entry.note ? ` — ${entry.note}` : ''}`,
          icon: entry.status === 'completed' ? 'resolve' : 'status',
        })
      }
    }
    if (request.assignedAt && vendor) {
      events.push({ date: request.assignedAt, type: 'Vendor Assigned', detail: `Assigned to ${vendor.name}`, icon: 'vendor' })
    }
    if (request.resolvedAt && !request.statusHistory?.some((h) => h.status === 'completed')) {
      events.push({ date: request.resolvedAt, type: 'Completed', detail: 'Request marked as completed', icon: 'resolve' })
    }
    return events.sort((a, b) => a.date.localeCompare(b.date))
  }, [request, vendor])

  if (!request) {
    return (
      <div className="page">
        <p>Maintenance request not found.</p>
        <Link to="/maintenance">Back to maintenance</Link>
      </div>
    )
  }

  async function handleStatusChange(status: MaintenanceStatus) {
    const history = [...(request!.statusHistory ?? [])]
    history.push({ status, date: nowISO() })
    await updateMaintenanceRequest(request!.id, {
      status,
      statusHistory: history,
      resolvedAt: status === 'completed' ? nowISO() : undefined,
    })
    toast(`Marked as ${STATUS_LABELS[status]}`)

    if (status === 'completed' && request!.recurrence && request!.recurrence !== 'none') {
      const nextDate = getNextRecurringDate(request!.scheduledDate ?? nowISO(), request!.recurrence)
      if (!nextDate) return
      await addMaintenanceRequest({
        propertyId: request!.propertyId,
        unitId: request!.unitId,
        tenantId: request!.tenantId,
        title: request!.title,
        description: request!.description,
        priority: request!.priority,
        status: 'open',
        category: request!.category,
        vendorId: request!.vendorId,
        scheduledDate: nextDate,
        recurrence: request!.recurrence,
        notes: request!.notes,
        statusHistory: [{ status: 'open', date: nowISO() }],
      })
      toast(`Next ${request!.recurrence} occurrence scheduled for ${nextDate}`, 'info')
    }
  }

  async function handleSaveActualCost() {
    const val = parseFloat(actualCostInput)
    if (isNaN(val) || val < 0) { toast('Invalid cost', 'error'); return }
    await updateMaintenanceRequest(request!.id, { actualCost: val })
    setEditingCost(false)
    toast('Actual cost updated')
  }

  async function handlePhotosChange(photos: MaintenancePhoto[]) {
    await updateMaintenanceRequest(request!.id, { photos })
  }

  async function handleDelete() {
    const ok = await confirm({ title: 'Delete request', message: `Delete "${request!.title}"?`, confirmText: 'Delete', danger: true })
    if (!ok) return
    const snap = takeSnapshot()
    try {
      await deleteMaintenanceRequest(request!.id)
      toast('Request deleted', {
        action: {
          label: 'Undo',
          onClick: async () => {
            try { await restoreSnapshot(snap); toast('Restored') } catch { toast('Undo failed', 'error') }
          },
        },
      })
      navigate('/maintenance')
    } catch {
      toast('Delete failed', 'error')
    }
  }

  function handleWorkOrder() {
    exportWorkOrderPdf({
      request: request!,
      property: property!,
      unit: unit ?? undefined,
      vendor: vendor ?? undefined,
      tenant: tenant ?? undefined,
    })
    toast('Work order PDF generated', 'info')
  }

  const statusBadgeClass = request.status === 'completed' ? 'active-lease' : request.status === 'in_progress' ? 'expiring' : 'expired'

  return (
    <div className="page maint-detail-page">
      <Breadcrumbs items={[{ label: 'Maintenance', to: '/maintenance' }, { label: request.title }]} />

      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{request.title}</h1>
            <span className={`badge priority-${request.priority}`}>{PRIORITY_LABELS[request.priority]}</span>
            <span className={`badge ${statusBadgeClass}`}>{STATUS_LABELS[request.status]}</span>
          </div>
          <p className="muted" style={{ marginTop: '0.25rem' }}>
            {CATEGORY_LABELS[request.category]} · {property?.name ?? 'Unknown property'}{unit ? ` — ${unit.name}` : ''}
          </p>
        </div>
        <div className="header-actions no-print">
          {request.status === 'open' && (
            <button type="button" className="btn small primary" onClick={() => handleStatusChange('in_progress')}>
              <Play size={14} /> Start Work
            </button>
          )}
          {request.status === 'in_progress' && (
            <button type="button" className="btn small primary" onClick={() => handleStatusChange('completed')}>
              <CheckCircle size={14} /> Mark Complete
            </button>
          )}
          {request.status === 'completed' && (
            <button type="button" className="btn small" onClick={() => handleStatusChange('open')}>
              Reopen
            </button>
          )}
          {property && (
            <button type="button" className="btn small" onClick={handleWorkOrder}>
              <Printer size={14} /> Work Order PDF
            </button>
          )}
          <button type="button" className="btn small danger" onClick={handleDelete}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      <div className="maint-detail-grid">
        <div className="maint-detail-main">
          {/* Description */}
          <section className="card section-card">
            <h2>Description</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{request.description}</p>
            {request.notes && (
              <>
                <h3 style={{ marginTop: '1rem' }}>Internal Notes</h3>
                <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{request.notes}</p>
              </>
            )}
          </section>

          {/* Timeline */}
          <section className="card section-card">
            <h2><Clock size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Timeline</h2>
            {timeline.length === 0 ? (
              <p className="muted">No timeline events yet.</p>
            ) : (
              <div className="maint-timeline">
                {timeline.map((ev, i) => (
                  <div key={i} className={`maint-timeline-item maint-timeline-${ev.icon}`}>
                    <div className="maint-timeline-dot" />
                    <div className="maint-timeline-content">
                      <span className="maint-timeline-date">{formatDate(ev.date)}</span>
                      <span className="maint-timeline-detail">{ev.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Photos */}
          <section className="card section-card">
            <h2><span style={{ marginRight: 6 }}>Photos</span><span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400 }}>({(request.photos ?? []).length})</span></h2>
            <MaintenancePhotos
              photos={request.photos ?? []}
              onChange={handlePhotosChange}
              readOnly={false}
            />
          </section>

          {/* Document Attachments */}
          <section className="card section-card">
            <DocumentAttachments entityType="maintenance" entityId={request.id} />
          </section>
        </div>

        <div className="maint-detail-sidebar">
          {/* Details sidebar */}
          <section className="card section-card">
            <h2>Details</h2>
            <div className="maint-detail-info">
              <div className="maint-info-row">
                <Home size={14} className="maint-info-icon" />
                <div>
                  <span className="maint-info-label">Property</span>
                  <span className="maint-info-value">{property ? <Link to={`/properties/${property.id}`} className="tenant-link">{property.name}</Link> : '—'}</span>
                </div>
              </div>
              {unit && (
                <div className="maint-info-row">
                  <MapPin size={14} className="maint-info-icon" />
                  <div>
                    <span className="maint-info-label">Unit</span>
                    <span className="maint-info-value">{unit.name}</span>
                  </div>
                </div>
              )}
              {tenant && (
                <div className="maint-info-row">
                  <User size={14} className="maint-info-icon" />
                  <div>
                    <span className="maint-info-label">Reported by</span>
                    <span className="maint-info-value"><Link to={`/tenants/${tenant.id}`} className="tenant-link">{tenant.name}</Link></span>
                  </div>
                </div>
              )}
              <div className="maint-info-row">
                <Wrench size={14} className="maint-info-icon" />
                <div>
                  <span className="maint-info-label">Vendor</span>
                  <span className="maint-info-value">{vendor ? <Link to={`/vendors/${vendor.id}`} className="tenant-link">{vendor.name}</Link> : <span className="muted">Unassigned</span>}</span>
                </div>
              </div>
              {request.scheduledDate && (
                <div className="maint-info-row">
                  <CalendarDays size={14} className="maint-info-icon" />
                  <div>
                    <span className="maint-info-label">Scheduled</span>
                    <span className="maint-info-value">{formatDate(request.scheduledDate)}</span>
                  </div>
                </div>
              )}
              <div className="maint-info-row">
                <CalendarDays size={14} className="maint-info-icon" />
                <div>
                  <span className="maint-info-label">Created</span>
                  <span className="maint-info-value">{formatDate(request.createdAt)}</span>
                </div>
              </div>
              {request.resolvedAt && (
                <div className="maint-info-row">
                  <CheckCircle size={14} className="maint-info-icon" />
                  <div>
                    <span className="maint-info-label">Resolved</span>
                    <span className="maint-info-value">{formatDate(request.resolvedAt)}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Cost */}
          <section className="card section-card">
            <h2><DollarSign size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Cost</h2>
            <div className="maint-cost-grid">
              <div>
                <span className="maint-info-label">Estimated</span>
                <span className="maint-cost-value">{request.cost ? formatMoney(request.cost) : '—'}</span>
              </div>
              <div>
                <span className="maint-info-label">Actual</span>
                {editingCost ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="number" min={0} step={0.01} value={actualCostInput} onChange={(e) => setActualCostInput(e.target.value)} style={{ width: 100 }} autoFocus />
                    <button type="button" className="btn small primary" onClick={handleSaveActualCost}>Save</button>
                    <button type="button" className="btn small" onClick={() => setEditingCost(false)}>Cancel</button>
                  </div>
                ) : (
                  <span className="maint-cost-value" style={{ cursor: 'pointer' }} onClick={() => { setActualCostInput(String(request.actualCost ?? '')); setEditingCost(true) }}>
                    {request.actualCost != null ? formatMoney(request.actualCost) : <span className="muted">Click to set</span>}
                  </span>
                )}
              </div>
              {request.cost && request.actualCost != null && (
                <div>
                  <span className="maint-info-label">Variance</span>
                  <span className={`maint-cost-value ${request.actualCost > request.cost ? 'negative' : 'positive'}`}>
                    {request.actualCost > request.cost ? '+' : ''}{formatMoney(request.actualCost - request.cost)}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
