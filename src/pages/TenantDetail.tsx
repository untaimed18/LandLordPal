import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { updateTenant } from '../store'
import { getLeaseStatus, getTenantReliability } from '../lib/calculations'
import { formatMoney, formatDate } from '../lib/format'
import Breadcrumbs from '../components/Breadcrumbs'
import DocumentAttachments from '../components/DocumentAttachments'
import LeaseRenewalModal from '../components/LeaseRenewalModal'
import EmailTemplateModal from '../components/EmailTemplateModal'
import InspectionChecklistModal from '../components/InspectionChecklistModal'
import { loadSettings } from '../lib/settings'
import { exportTenantStatementPdf, formatMoneyForPdf } from '../lib/pdfExport'
import { User, Phone, Mail, CalendarDays, DollarSign, ShieldCheck, Clock, TrendingUp, RefreshCw, Printer, RotateCw, Send, FileText, ClipboardList, UserCheck, UserX, UserPlus, CircleDollarSign } from 'lucide-react'
import { toCSV, downloadCSV } from '../lib/csv'
import { nowISO } from '../lib/id'
import { useToast } from '../context/ToastContext'
import type { InspectionChecklist, InspectionItem } from '../types'

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const { tenants, properties, units, payments, communicationLogs, emailTemplates } = useStore()
  const toast = useToast()
  const [showRenewal, setShowRenewal] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [showInspection, setShowInspection] = useState<'move_in' | 'move_out' | null>(null)

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

  const ledger = useMemo(() => {
    if (!tenant) return []
    const entries: { date: string; description: string; charge: number; payment: number; balance: number }[] = []
    const leaseStart = new Date(tenant.leaseStart + 'T12:00:00')
    const leaseEnd = new Date(tenant.leaseEnd + 'T12:00:00')
    const now = new Date()
    const endDate = leaseEnd < now ? leaseEnd : now
    let balance = 0

    const rentPayments = [...tenantPayments].filter((p) => !p.category || p.category === 'rent').sort((a, b) => a.date.localeCompare(b.date))
    const depositPayments = tenantPayments.filter((p) => p.category === 'deposit').sort((a, b) => a.date.localeCompare(b.date))
    const lastMonthPayments = tenantPayments.filter((p) => p.category === 'last_month').sort((a, b) => a.date.localeCompare(b.date))
    const otherPayments = tenantPayments.filter((p) => p.category === 'fee' || p.category === 'other').sort((a, b) => a.date.localeCompare(b.date))

    if (tenant.deposit && tenant.deposit > 0) {
      balance += tenant.deposit
      entries.push({ date: tenant.leaseStart, description: 'Security deposit due', charge: tenant.deposit, payment: 0, balance })
      for (const p of depositPayments) {
        balance -= p.amount
        entries.push({ date: p.date, description: `Security deposit payment${p.method ? ` (${p.method})` : ''}`, charge: 0, payment: p.amount, balance })
      }
    }

    if (tenant.requireLastMonth) {
      balance += tenant.monthlyRent
      entries.push({ date: tenant.leaseStart, description: "Last month's rent due", charge: tenant.monthlyRent, payment: 0, balance })
      for (const p of lastMonthPayments) {
        balance -= p.amount
        entries.push({ date: p.date, description: `Last month's rent payment${p.method ? ` (${p.method})` : ''}`, charge: 0, payment: p.amount, balance })
      }
    }

    const d = new Date(leaseStart.getFullYear(), leaseStart.getMonth(), 1)
    while (d <= endDate) {
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      balance += tenant.monthlyRent
      entries.push({ date: `${monthStr}-01`, description: `Rent due — ${monthStr}`, charge: tenant.monthlyRent, payment: 0, balance })
      const monthRentPayments = rentPayments.filter((p) => p.date.startsWith(monthStr))
      for (const p of monthRentPayments) {
        balance -= p.amount
        entries.push({ date: p.date, description: `Payment${p.method ? ` (${p.method})` : ''}${p.notes ? ` — ${p.notes}` : ''}`, charge: 0, payment: p.amount, balance })
        if (p.lateFee && p.lateFee > 0) {
          balance += p.lateFee
          entries.push({ date: p.date, description: 'Late fee', charge: p.lateFee, payment: 0, balance })
        }
      }
      d.setMonth(d.getMonth() + 1)
    }

    for (const p of otherPayments) {
      balance -= p.amount
      entries.push({ date: p.date, description: `${p.category === 'fee' ? 'Fee' : 'Other'} payment${p.notes ? ` — ${p.notes}` : ''}`, charge: 0, payment: p.amount, balance })
    }

    return entries
  }, [tenant, tenantPayments])

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
          <button type="button" className="btn small primary" onClick={() => setShowRenewal(true)}><RotateCw size={14} /> Renew Lease</button>
          <button type="button" className="btn small" onClick={() => setShowEmail(true)} disabled={!tenant.email}><Send size={14} /> Send Email</button>
          <button type="button" className="btn small" onClick={() => setShowInspection('move_in')}><ClipboardList size={14} /> Move-In Inspect</button>
          <button type="button" className="btn small" onClick={() => setShowInspection('move_out')}><ClipboardList size={14} /> Move-Out Inspect</button>
          {tenantPayments.length > 0 && (
            <button type="button" className="btn small" onClick={() => {
              downloadCSV(`${tenant.name.replace(/\s+/g, '-')}-payments-${nowISO()}.csv`, toCSV(
                ['Date', 'Amount', 'Method', 'Period Start', 'Period End', 'Notes'],
                tenantPayments.map((p) => [p.date, p.amount, p.method ?? '', p.periodStart, p.periodEnd, p.notes ?? ''])
              ))
              toast('Payments exported', 'info')
            }}>Export payments CSV</button>
          )}
          {ledger.length > 0 && (
            <button type="button" className="btn small" onClick={() => {
              exportTenantStatementPdf({
                tenantName: tenant.name,
                propertyName: property?.name ?? 'Unknown',
                unitName: unit?.name ?? 'Unknown',
                monthlyRent: tenant.monthlyRent,
                leaseStart: tenant.leaseStart,
                leaseEnd: tenant.leaseEnd,
                transactions: ledger,
                filename: `${tenant.name.replace(/\s+/g, '-')}-statement-${nowISO()}.pdf`,
              })
              toast('Statement exported', 'info')
            }}><FileText size={14} /> Export Statement PDF</button>
          )}
        </div>
      </div>

      {showRenewal && <LeaseRenewalModal tenant={tenant} onClose={() => setShowRenewal(false)} />}
      {showInspection && <InspectionChecklistModal tenant={tenant} type={showInspection} onClose={() => setShowInspection(null)} />}
      {showEmail && property && unit && (
        <EmailTemplateModal
          tenant={tenant}
          property={property}
          unit={unit}
          templates={emailTemplates}
          onClose={() => setShowEmail(false)}
        />
      )}

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

      {(tenant.deposit != null && tenant.deposit > 0 || tenant.requireLastMonth) && (() => {
        const depositOwed = tenant.deposit ?? 0
        const depositPaid = tenant.depositPaidAmount ?? 0
        const depositStatus = tenant.depositStatus ?? (depositOwed > 0 ? 'pending' : undefined)
        const lastMonthOwed = tenant.requireLastMonth ? tenant.monthlyRent : 0
        const lastMonthPaid = tenant.lastMonthPaid
        const firstMonthOwed = tenant.requireFirstMonth ? tenant.monthlyRent : 0
        const firstMonthPaid = tenantPayments.some((p) => (!p.category || p.category === 'rent') && p.date.startsWith(tenant.leaseStart.slice(0, 7)))

        const totalOwed = depositOwed + lastMonthOwed + firstMonthOwed
        const totalCollected = depositPaid + (lastMonthPaid ? lastMonthOwed : 0) + (firstMonthPaid ? firstMonthOwed : 0)

        return (
          <section className="card section-card" style={{ marginBottom: '1.5rem' }}>
            <h2><CircleDollarSign size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Move-In Costs</h2>
            <div className="movein-cost-grid">
              {depositOwed > 0 && (
                <div className="movein-cost-item">
                  <div className="movein-cost-item-header">
                    <span className="movein-cost-item-label">Security Deposit</span>
                    <span className={`badge ${depositStatus === 'paid' ? 'paid' : depositStatus === 'partial' ? 'partial' : 'overdue'}`}>
                      {depositStatus === 'paid' ? 'Paid' : depositStatus === 'partial' ? 'Partial' : 'Pending'}
                    </span>
                  </div>
                  <span className="movein-cost-item-amount">{formatMoney(depositOwed)}</span>
                  {depositStatus === 'partial' && <span className="movein-cost-item-sub">{formatMoney(depositPaid)} of {formatMoney(depositOwed)} received</span>}
                  {tenant.depositPaidDate && <span className="movein-cost-item-sub">Received {formatDate(tenant.depositPaidDate)}</span>}
                </div>
              )}
              {firstMonthOwed > 0 && (
                <div className="movein-cost-item">
                  <div className="movein-cost-item-header">
                    <span className="movein-cost-item-label">First Month's Rent</span>
                    <span className={`badge ${firstMonthPaid ? 'paid' : 'overdue'}`}>{firstMonthPaid ? 'Paid' : 'Pending'}</span>
                  </div>
                  <span className="movein-cost-item-amount">{formatMoney(firstMonthOwed)}</span>
                </div>
              )}
              {lastMonthOwed > 0 && (
                <div className="movein-cost-item">
                  <div className="movein-cost-item-header">
                    <span className="movein-cost-item-label">Last Month's Rent</span>
                    <span className={`badge ${lastMonthPaid ? 'paid' : 'overdue'}`}>{lastMonthPaid ? 'Paid' : 'Pending'}</span>
                  </div>
                  <span className="movein-cost-item-amount">{formatMoney(lastMonthOwed)}</span>
                </div>
              )}
            </div>
            {totalOwed > 0 && (
              <div className="movein-cost-total">
                <span>Total: <strong>{formatMoney(totalCollected)}</strong> of <strong>{formatMoney(totalOwed)}</strong> collected</span>
                {totalCollected < totalOwed && (
                  <span className="negative" style={{ fontWeight: 600 }}>Outstanding: {formatMoney(totalOwed - totalCollected)}</span>
                )}
              </div>
            )}
          </section>
        )
      })()}

      <section className="card section-card" style={{ marginBottom: '1.5rem' }}>
        <h2><ShieldCheck size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Screening & Application</h2>
        <div className="screening-layout">
          <div className="screening-status-card">
            <div className={`screening-status-icon ${tenant.screeningStatus === 'approved' ? 'approved' : tenant.screeningStatus === 'rejected' ? 'rejected' : tenant.screeningStatus === 'applied' ? 'applied' : 'none'}`}>
              {tenant.screeningStatus === 'approved' ? <UserCheck size={22} /> : tenant.screeningStatus === 'rejected' ? <UserX size={22} /> : <UserPlus size={22} />}
            </div>
            <div className="screening-status-info">
              <span className="screening-status-label">Application Status</span>
              <select
                className="screening-status-select"
                value={tenant.screeningStatus ?? ''}
                onChange={async (e) => {
                  const val = e.target.value as 'applied' | 'approved' | 'rejected' | ''
                  try {
                    await updateTenant(tenant.id, { screeningStatus: val || undefined })
                    toast('Screening status updated')
                  } catch { toast('Failed to update status', 'error') }
                }}
              >
                <option value="">Not set</option>
                <option value="applied">Applied</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          <div className="screening-notes-area">
            <label className="screening-notes-label">
              <FileText size={14} style={{ marginRight: 4, verticalAlign: '-2px', color: 'var(--text-muted)' }} />
              Screening Notes
            </label>
            <textarea
              className="screening-notes-input"
              defaultValue={tenant.screeningNotes ?? ''}
              rows={4}
              onBlur={async (e) => {
                const val = e.target.value
                if (val !== (tenant.screeningNotes ?? '')) {
                  try {
                    await updateTenant(tenant.id, { screeningNotes: val || undefined })
                    toast('Screening notes saved')
                  } catch { toast('Failed to save notes', 'error') }
                }
              }}
              placeholder="Background check results, references, credit score, employment verification, etc."
            />
            <span className="screening-notes-hint">Auto-saves when you click away</span>
          </div>
        </div>
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

      {ledger.length > 0 && (
        <section className="card section-card" style={{ marginBottom: '1.5rem' }}>
          <h2><FileText size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Account Ledger</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Description</th><th>Charges</th><th>Payments</th><th>Balance</th></tr></thead>
              <tbody>
                {ledger.map((e, i) => (
                  <tr key={i}>
                    <td>{formatDate(e.date)}</td>
                    <td>{e.description}</td>
                    <td className={e.charge > 0 ? 'negative' : ''}>{e.charge > 0 ? formatMoney(e.charge) : ''}</td>
                    <td className={e.payment > 0 ? 'positive' : ''}>{e.payment > 0 ? formatMoney(e.payment) : ''}</td>
                    <td className={e.balance > 0 ? 'negative' : e.balance < 0 ? 'positive' : ''}>{formatMoney(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ledger.length > 0 && (
            <p style={{ marginTop: '0.75rem', fontWeight: 600 }}>
              Current balance: <span className={ledger[ledger.length - 1].balance > 0 ? 'negative' : 'positive'}>{formatMoney(ledger[ledger.length - 1].balance)}</span>
            </p>
          )}
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

      {tenant.inspections && tenant.inspections.length > 0 && (
        <section className="card section-card" style={{ marginBottom: '1.5rem' }}>
          <h2><ClipboardList size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Inspection Reports ({tenant.inspections.length})</h2>
          {tenant.inspections.map((insp, idx) => (
            <div key={idx} style={{ marginBottom: idx < tenant.inspections!.length - 1 ? '1.5rem' : 0 }}>
              <h3 style={{ marginBottom: '0.5rem' }}>{insp.type === 'move_in' ? 'Move-In' : 'Move-Out'} — {formatDate(insp.date)}</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Area</th><th>Condition</th><th>Notes</th></tr></thead>
                  <tbody>
                    {insp.items.map((item, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{item.area}</td>
                        <td><span className={`badge ${item.condition === 'damaged' || item.condition === 'poor' ? 'expired' : item.condition === 'fair' ? 'expiring' : 'active-lease'}`}>{item.condition}</span></td>
                        <td>{item.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {insp.generalNotes && <p className="muted" style={{ marginTop: '0.5rem' }}>{insp.generalNotes}</p>}
            </div>
          ))}
        </section>
      )}

      <section className="card section-card">
        <DocumentAttachments entityType="tenant" entityId={tenant.id} />
      </section>
    </div>
  )
}
