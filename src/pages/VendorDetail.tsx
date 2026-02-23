import { useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { deleteVendor, takeSnapshot, restoreSnapshot } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatMoney, formatDate } from '../lib/format'
import { getVendorPerformance } from '../lib/calculations'
import type { VendorGrade } from '../lib/calculations'
import Breadcrumbs from '../components/Breadcrumbs'
import { Phone, Mail, Wrench, DollarSign } from 'lucide-react'

const GRADE_COLORS: Record<VendorGrade, string> = {
  A: 'var(--positive)',
  B: '#4CAF50',
  C: '#FFC107',
  D: '#FF9800',
  F: 'var(--negative)',
}

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>()
  const { vendors, maintenanceRequests, expenses, properties, units } = useStore()
  const toast = useToast()
  const confirm = useConfirm()

  const navigate = useNavigate()
  const vendor = vendors.find((v) => v.id === id)

  const perf = useMemo(
    () => (vendor ? getVendorPerformance(vendor.id, maintenanceRequests, expenses) : null),
    [vendor, maintenanceRequests, expenses],
  )

  const vendorJobs = useMemo(
    () => maintenanceRequests.filter((r) => r.vendorId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [maintenanceRequests, id],
  )

  const vendorExpenses = useMemo(
    () => expenses.filter((e) => e.vendorId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, id],
  )

  if (!vendor) {
    return (
      <div className="page">
        <p>Vendor not found.</p>
        <Link to="/vendors">Back to vendors</Link>
      </div>
    )
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete vendor',
      message: `Delete "${vendor!.name}"? This will unlink them from all maintenance requests and expenses.`,
      confirmText: 'Delete',
      danger: true,
    })
    if (!ok) return
    const snap = takeSnapshot()
    try {
      await deleteVendor(vendor!.id)
      toast('Vendor deleted', {
        action: {
          label: 'Undo',
          onClick: async () => {
            try { await restoreSnapshot(snap); toast('Vendor restored') } catch { toast('Undo failed', 'error') }
          },
        },
      })
      navigate('/vendors')
    } catch {
      toast('Failed to delete vendor', 'error')
    }
  }

  return (
    <div className="page vendor-detail-page">
      <Breadcrumbs items={[{ label: 'Vendors', to: '/vendors' }, { label: vendor.name }]} />

      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="stc-avatar"><Wrench size={22} /></div>
            <div>
              <h1 style={{ margin: 0 }}>{vendor.name}</h1>
              {vendor.specialty && <span className="badge" style={{ marginTop: '0.25rem' }}>{vendor.specialty}</span>}
            </div>
            {perf && perf.totalJobs > 0 && (
              <span className="reliability-badge" style={{ borderColor: GRADE_COLORS[perf.grade] }} title={`Performance: ${perf.score}/100 — ${perf.label}`}>
                <span className="reliability-grade" style={{ color: GRADE_COLORS[perf.grade] }}>{perf.grade}</span>
                <span className="reliability-label">{perf.score}</span>
              </span>
            )}
          </div>
          <div className="stc-contact" style={{ marginTop: '0.5rem' }}>
            {vendor.phone && <span><Phone size={13} /> {vendor.phone}</span>}
            {vendor.email && <span><Mail size={13} /> {vendor.email}</span>}
          </div>
          {vendor.notes && <p className="muted" style={{ marginTop: '0.5rem' }}>{vendor.notes}</p>}
        </div>
        <div className="header-actions">
          <Link to="/vendors" className="btn small">Back to vendors</Link>
          <button type="button" className="btn small danger" onClick={handleDelete}>Delete vendor</button>
        </div>
      </div>

      {perf && (
        <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <span className="stat-label">Total Jobs</span>
            <span className="stat-value">{perf.totalJobs}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Completed</span>
            <span className="stat-value positive">{perf.completedJobs}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Open / In Progress</span>
            <span className={`stat-value ${perf.openJobs + perf.inProgressJobs > 0 ? 'negative' : ''}`}>{perf.openJobs + perf.inProgressJobs}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Completion Rate</span>
            <span className="stat-value">{perf.completionRate.toFixed(0)}%</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total Spent</span>
            <span className="stat-value">{formatMoney(perf.totalSpent)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Avg Cost/Job</span>
            <span className="stat-value">{perf.avgCostPerJob != null ? formatMoney(perf.avgCostPerJob) : '—'}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Avg Response</span>
            <span className="stat-value">{perf.avgResponseDays != null ? `${perf.avgResponseDays}d` : '—'}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Avg Completion</span>
            <span className="stat-value">{perf.avgCompletionDays != null ? `${perf.avgCompletionDays}d` : '—'}</span>
          </div>
        </div>
      )}

      <section className="card section-card">
        <h2><Wrench size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Maintenance Jobs ({vendorJobs.length})</h2>
        {vendorJobs.length === 0 ? (
          <p className="empty-state">No jobs assigned to this vendor yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Title</th><th>Property</th><th>Priority</th><th>Status</th><th>Cost</th><th>Date</th></tr>
              </thead>
              <tbody>
                {vendorJobs.map((j) => {
                  const prop = properties.find((p) => p.id === j.propertyId)
                  const unit = j.unitId ? units.find((u) => u.id === j.unitId) : null
                  return (
                    <tr key={j.id}>
                      <td><Link to={`/maintenance/${j.id}`} className="tenant-link"><strong>{j.title}</strong></Link></td>
                      <td>{prop?.name ?? '—'}{unit && <span className="muted"> — {unit.name}</span>}</td>
                      <td><span className={`badge priority-${j.priority}`}>{j.priority}</span></td>
                      <td><span className={`badge ${j.status === 'completed' ? 'active-lease' : j.status === 'in_progress' ? 'expiring' : 'expired'}`}>{j.status.replace('_', ' ')}</span></td>
                      <td>{j.cost ? formatMoney(j.cost) : '—'}</td>
                      <td>{formatDate(j.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {vendorExpenses.length > 0 && (
        <section className="card section-card">
          <h2><DollarSign size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Linked Expenses ({vendorExpenses.length})</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Property</th><th>Category</th><th>Description</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {vendorExpenses.map((ex) => {
                  const prop = properties.find((p) => p.id === ex.propertyId)
                  return (
                    <tr key={ex.id}>
                      <td>{formatDate(ex.date)}</td>
                      <td>{prop?.name ?? '—'}</td>
                      <td>{ex.category}</td>
                      <td>{ex.description}</td>
                      <td>{formatMoney(ex.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
