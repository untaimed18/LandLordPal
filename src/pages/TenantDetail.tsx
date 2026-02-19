import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { getLeaseStatus, getTenantReliability } from '../lib/calculations'
import { formatMoney, formatDate } from '../lib/format'
import Breadcrumbs from '../components/Breadcrumbs'
import DocumentAttachments from '../components/DocumentAttachments'
import { loadSettings } from '../lib/settings'
import { User, Phone, Mail, CalendarDays, DollarSign, ShieldCheck, Clock, TrendingUp, RefreshCw, Printer } from 'lucide-react'
import { toCSV, downloadCSV } from '../lib/csv'
import { nowISO } from '../lib/id'
import { useToast } from '../context/ToastContext'

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const { tenants, properties, units, payments, communicationLogs } = useStore()
  const toast = useToast()

  const tenant = tenants.find((t) => t.id === id)
  const settings = loadSettings()

  const tenantPayments = useMemo(
    () => (tenant ? payments.filter((p) => p.tenantId === tenant.id).sort((a, b) => b.date.localeCompare(a.date)) : []),
    [payments, tenant],
  )

  const paymentStats = useMemo(() => {
    if (!tenant) return { total: 0, count: 0, lateCount: 0, avgPayment: 0, monthlyMap: new Map<string, number>() }
    const total = tenantPayments.reduce((s, p) => s + p.amount, 0)
    const count = tenantPayments.length
    const graceDays = tenant.gracePeriodDays ?? settings.defaultGracePeriodDays
    const lateCount = tenantPayments.filter((p) => {
      const day = parseInt(p.date.split('-')[2], 10)
      return day > graceDays
    }).length

    const monthlyMap = new Map<string, number>()
    for (const p of tenantPayments) {
      const key = p.date.slice(0, 7)
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + p.amount)
    }

    return { total, count, lateCount, avgPayment: count > 0 ? total / count : 0, monthlyMap }
  }, [tenantPayments, tenant, settings.defaultGracePeriodDays])

  const reliability = useMemo(
    () => (tenant ? getTenantReliability(tenant, payments, settings.defaultGracePeriodDays) : null),
    [tenant, payments, settings.defaultGracePeriodDays],
  )

  if (!tenant) {
    return (
      <div className="page">
        <p>Tenant not found.</p>
        <Link to="/properties">Back to properties</Link>
      </div>
    )
  }

  const property = properties.find((p) => p.id === tenant.propertyId)
  const unit = units.find((u) => u.id === tenant.unitId)
  const tenantComms = communicationLogs.filter((c) => c.tenantId === tenant.id).sort((a, b) => b.date.localeCompare(a.date))
  const leaseStatus = getLeaseStatus(tenant.leaseEnd)

  const statusBadge = leaseStatus === 'expired'
    ? <span className="badge expired">Lease expired</span>
    : leaseStatus === 'expiring'
      ? <span className="badge expiring">Expiring soon</span>
      : <span className="badge active-lease">Active</span>

  return (
    <div className="page tenant-detail">
      <Breadcrumbs items={[
        { label: 'Properties', to: '/properties' },
        ...(property ? [{ label: property.name, to: `/properties/${property.id}` }] : []),
        { label: tenant.name },
      ]} />

      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="stc-avatar"><User size={22} /></div>
            <div>
              <h1 style={{ margin: 0 }}>{tenant.name}</h1>
              <p className="muted" style={{ margin: 0 }}>
                {property?.name ?? 'Unknown property'}{unit ? ` — ${unit.name}` : ''}
              </p>
            </div>
            {statusBadge}
            {tenant.autopay && <span className="badge" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}><RefreshCw size={12} /> Autopay</span>}
          </div>
          <div className="stc-contact" style={{ marginTop: '0.5rem' }}>
            {tenant.phone && <span><Phone size={13} /> {tenant.phone}</span>}
            {tenant.email && <span><Mail size={13} /> {tenant.email}</span>}
          </div>
        </div>
        <div className="header-actions no-print">
          <button type="button" className="btn small" onClick={() => window.print()}><Printer size={14} /> Print summary</button>
          {tenantPayments.length > 0 && (
            <button type="button" className="btn small" onClick={() => {
              downloadCSV(`${tenant.name.replace(/\s+/g, '-')}-payments-${nowISO()}.csv`, toCSV(
                ['Date', 'Amount', 'Method', 'Period Start', 'Period End', 'Notes'],
                tenantPayments.map((p) => [p.date, p.amount, p.method ?? '', p.periodStart, p.periodEnd, p.notes ?? ''])
              ))
              toast('Payments exported', 'info')
            }}>Export payments CSV</button>
          )}
        </div>
      </div>

      <div className="stats-grid two" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <span className="stat-label">Total payments</span>
          <span className="stat-value positive">{formatMoney(paymentStats.total)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Payment count</span>
          <span className="stat-value">{paymentStats.count}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Late payments</span>
          <span className={`stat-value ${paymentStats.lateCount > 0 ? 'negative' : ''}`}>{paymentStats.lateCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Avg payment</span>
          <span className="stat-value">{formatMoney(paymentStats.avgPayment)}</span>
        </div>
      </div>

      {reliability && (
        <section className="card section-card reliability-section" style={{ marginBottom: '1.5rem' }}>
          <h2><ShieldCheck size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Reliability Score</h2>
          <div className="reliability-meter-row">
            <div className="reliability-meter-wrap">
              <div className="reliability-meter-track">
                <div
                  className={`reliability-meter-fill grade-${reliability.grade}`}
                  style={{ width: `${reliability.score}%` }}
                />
              </div>
              <div className="reliability-meter-labels">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>
            <div className="reliability-score-display">
              <span className={`reliability-big-grade grade-${reliability.grade}`}>{reliability.grade}</span>
              <span className="reliability-big-score">{reliability.score}</span>
              <span className="reliability-big-label">{reliability.label}</span>
            </div>
          </div>
          <div className="reliability-breakdown">
            <div className="reliability-factor">
              <span className="reliability-factor-label">On-time payments</span>
              <span className="reliability-factor-value">{reliability.onTimeRate}%</span>
            </div>
            <div className="reliability-factor">
              <span className="reliability-factor-label">Consistency</span>
              <span className="reliability-factor-value">{reliability.consistencyScore}/100</span>
            </div>
            <div className="reliability-factor">
              <span className="reliability-factor-label">Tenure</span>
              <span className="reliability-factor-value">{reliability.tenureMonths} month{reliability.tenureMonths !== 1 ? 's' : ''}</span>
            </div>
            <div className="reliability-factor">
              <span className="reliability-factor-label">Late fees incurred</span>
              <span className="reliability-factor-value">{reliability.latePayments} of {reliability.totalPayments}</span>
            </div>
          </div>
        </section>
      )}

      <section className="card section-card" style={{ marginBottom: '1.5rem' }}>
        <h2><CalendarDays size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Lease Details</h2>
        <div className="stc-details-grid">
          <div className="stc-detail"><CalendarDays size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Lease period</span><span className="stc-detail-value">{formatDate(tenant.leaseStart)} — {formatDate(tenant.leaseEnd)}</span></div></div>
          <div className="stc-detail"><DollarSign size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Monthly rent</span><span className="stc-detail-value">{formatMoney(tenant.monthlyRent)}</span></div></div>
          {tenant.deposit != null && tenant.deposit > 0 && (
            <div className="stc-detail"><ShieldCheck size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Security deposit</span><span className="stc-detail-value">{formatMoney(tenant.deposit)}</span></div></div>
          )}
          {(tenant.gracePeriodDays != null && tenant.gracePeriodDays > 0) && (
            <div className="stc-detail"><Clock size={14} className="stc-detail-icon" /><div><span className="stc-detail-label">Grace period</span><span className="stc-detail-value">{tenant.gracePeriodDays} days{tenant.lateFeeAmount != null && tenant.lateFeeAmount > 0 ? ` · ${formatMoney(tenant.lateFeeAmount)} late fee` : ''}</span></div></div>
          )}
        </div>
        {tenant.notes && <p className="stc-notes">{tenant.notes}</p>}
      </section>

      {tenant.rentHistory && tenant.rentHistory.length > 0 && (
        <section className="card section-card" style={{ marginBottom: '1.5rem' }}>
          <h2><TrendingUp size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Rent History</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Old Rent</th><th>New Rent</th><th>Change</th></tr></thead>
              <tbody>
                {tenant.rentHistory.map((r, i) => {
                  const diff = r.newRent - r.oldRent
                  return (
                    <tr key={i}>
                      <td>{formatDate(r.date)}</td>
                      <td>{formatMoney(r.oldRent)}</td>
                      <td>{formatMoney(r.newRent)}</td>
                      <td className={diff > 0 ? 'positive' : diff < 0 ? 'negative' : ''}>{diff > 0 ? '+' : ''}{formatMoney(diff)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card section-card" style={{ marginBottom: '1.5rem' }}>
        <h2><DollarSign size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Payment History ({tenantPayments.length})</h2>
        {tenantPayments.length === 0 ? (
          <p className="empty-state">No payments recorded yet.</p>
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
                    <td>{formatDate(p.periodStart)} — {formatDate(p.periodEnd)}</td>
                    <td>{p.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {tenantComms.length > 0 && (
        <section className="card section-card" style={{ marginBottom: '1.5rem' }}>
          <h2>Communication Log ({tenantComms.length})</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Type</th><th>Subject</th><th>Notes</th></tr></thead>
              <tbody>
                {tenantComms.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDate(c.date)}</td>
                    <td><span className="badge small">{c.type}</span></td>
                    <td>{c.subject}</td>
                    <td>{c.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card section-card">
        <DocumentAttachments entityType="tenant" entityId={tenant.id} />
      </section>
    </div>
  )
}
