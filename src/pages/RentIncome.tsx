import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { getRentRollForMonth, getTenantReliability } from '../lib/calculations'
import { loadSettings } from '../lib/settings'
import { addPayment, updateTenant } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatMoney, formatDate, formatMonthYear } from '../lib/format'
import { nowISO } from '../lib/id'
import { toCSV, downloadCSV } from '../lib/csv'
import { RefreshCw, DollarSign, Calendar, CreditCard, User, Home, Banknote, Percent, TrendingUp, TrendingDown, Users } from 'lucide-react'

function startOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function endOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export default function RentIncome() {
  const { properties, units, tenants, payments } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const settings = loadSettings()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [paymentModal, setPaymentModal] = useState<{ tenantId: string; amount: number; tenantName: string; propertyName: string; unitName: string; expectedRent: number; paidAmount: number } | null>(null)
  const [paymentDate, setPaymentDate] = useState(nowISO())
  const [paymentMethod, setPaymentMethod] = useState<'check' | 'transfer' | 'cash' | 'other'>('transfer')
  const [showBulkRent, setShowBulkRent] = useState(false)
  const [bulkRentPct, setBulkRentPct] = useState(3)
  const [bulkRentFlat, setBulkRentFlat] = useState(0)
  const [bulkRentMode, setBulkRentMode] = useState<'pct' | 'flat'>('pct')

  useEffect(() => {
    if (!paymentModal) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPaymentModal(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [paymentModal])

  const rentRoll = getRentRollForMonth(year, month, properties, units, tenants, payments)
  const totalExpected = rentRoll.reduce((s, r) => s + r.expectedRent, 0)
  const totalCollected = rentRoll.reduce((s, r) => s + r.paidAmount, 0)
  const outstanding = totalExpected - totalCollected

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: i, label: new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' }) }))
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  const unpaidAutopay = rentRoll.filter((r) => !r.paid && r.tenant.autopay)

  async function handleRecordAllAutopay() {
    if (unpaidAutopay.length === 0) return
    const ok = await confirm({
      title: 'Record autopay payments',
      message: `Record ${unpaidAutopay.length} autopay payment${unpaidAutopay.length !== 1 ? 's' : ''} for the full rent amount?`,
      confirmText: 'Record all',
    })
    if (!ok) return
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
    const dateStr = isCurrentMonth ? nowISO() : `${year}-${String(month + 1).padStart(2, '0')}-01`
    const d = new Date(dateStr + 'T12:00:00')
    try {
      for (const r of unpaidAutopay) {
        await addPayment({
          propertyId: r.property.id,
          unitId: r.unit.id,
          tenantId: r.tenant.id,
          amount: r.expectedRent,
          date: dateStr,
          periodStart: startOfMonth(d),
          periodEnd: endOfMonth(d),
          method: 'transfer',
          notes: 'Autopay',
        })
      }
      toast(`${unpaidAutopay.length} autopay payment${unpaidAutopay.length !== 1 ? 's' : ''} recorded`)
    } catch {
      toast('Failed to record autopay payments', 'error')
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!paymentModal) return
    const tenant = tenants.find((t) => t.id === paymentModal.tenantId)
    if (!tenant) return
    const d = new Date(paymentDate + 'T12:00:00')
    const payMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const existingPayment = payments.find(
      (p) => p.tenantId === tenant.id && p.date.startsWith(payMonth)
    )
    if (existingPayment) {
      const ok = await confirm({
        title: 'Possible duplicate',
        message: `A payment of ${formatMoney(existingPayment.amount)} was already recorded for ${tenant.name} in ${payMonth}. Record another payment anyway?`,
        confirmText: 'Record anyway',
      })
      if (!ok) return
    }
    try {
      await addPayment({
        propertyId: tenant.propertyId,
        unitId: tenant.unitId,
        tenantId: tenant.id,
        amount: paymentModal.amount,
        date: paymentDate,
        periodStart: startOfMonth(d),
        periodEnd: endOfMonth(d),
        method: paymentMethod,
      })
      toast('Payment recorded')
      setPaymentModal(null)
    } catch {
      toast('Failed to record payment', 'error')
    }
  }

  async function handleBulkRentAdjust() {
    const adjustments = tenants.map((t) => {
      const newRent = bulkRentMode === 'pct'
        ? Math.round(t.monthlyRent * (1 + bulkRentPct / 100))
        : t.monthlyRent + bulkRentFlat
      return { id: t.id, oldRent: t.monthlyRent, newRent }
    }).filter((a) => a.newRent !== a.oldRent && a.newRent > 0)

    if (adjustments.length === 0) { toast('No adjustments to make', 'info'); return }

    const desc = bulkRentMode === 'pct' ? `${bulkRentPct}% increase` : `$${bulkRentFlat} increase`
    const ok = await confirm({
      title: `Adjust rent for ${adjustments.length} tenants?`,
      message: `Apply a ${desc} to all current tenants. This will update their monthly rent amounts.`,
      confirmText: `Adjust ${adjustments.length} rents`,
    })
    if (!ok) return

    try {
      for (const a of adjustments) {
        await updateTenant(a.id, { monthlyRent: a.newRent })
      }
      toast(`Rent adjusted for ${adjustments.length} tenants`)
      setShowBulkRent(false)
    } catch {
      toast('Bulk rent adjustment failed partway through', 'error')
    }
  }

  return (
    <div className="page rent-income-page">
      <div className="page-header">
        <div>
          <h1>Rent & income</h1>
          <p className="page-desc">See who has paid this month and record rent payments.</p>
        </div>
        {unpaidAutopay.length > 0 && (
          <button type="button" className="btn primary" onClick={handleRecordAllAutopay}>
            <RefreshCw size={14} /> Record {unpaidAutopay.length} autopay
          </button>
        )}
        {tenants.length > 0 && (
          <button type="button" className="btn" onClick={() => setShowBulkRent(true)}>
            Bulk Rent Adjust
          </button>
        )}
        {rentRoll.length > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const csv = toCSV(
                ['Tenant', 'Property', 'Unit', 'Expected', 'Paid', 'Status', 'Payment Date'],
                rentRoll.map((r) => [
                  r.tenant.name,
                  r.property.name,
                  r.unit.name,
                  r.expectedRent,
                  r.paidAmount,
                  r.paid ? 'Paid' : r.paidAmount > 0 ? 'Partial' : 'Not paid',
                  r.paymentDate ?? '',
                ])
              )
              downloadCSV(`rent-roll-${year}-${String(month + 1).padStart(2, '0')}.csv`, csv)
              toast('Rent roll exported', 'info')
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      <div className="rent-controls card">
        <div className="rent-controls-row">
          <label>
            <span className="label-text">Month</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="select-inline"
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label-text">Year</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="select-inline">
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="rent-summary">
          <span><strong>Expected:</strong> {formatMoney(totalExpected)}</span>
          <span className="positive"><strong>Collected:</strong> {formatMoney(totalCollected)}</span>
          {outstanding > 0 && (
            <span className="negative"><strong>Outstanding:</strong> {formatMoney(outstanding)}</span>
          )}
        </div>
      </div>

      {tenants.length === 0 ? (
        <div className="empty-state-card card">
          <p className="empty-state-title">No tenants yet</p>
          <p className="empty-state-text">Add properties and units, then add tenants to see the rent roll and record payments.</p>
          <Link to="/properties" className="btn primary">Go to properties</Link>
        </div>
      ) : (
        <>
          <section className="card section-card">
            <div className="section-card-header">
              <h2>Rent roll — {formatMonthYear(`${year}-${String(month + 1).padStart(2, '0')}-01`)}</h2>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Property / Unit</th>
                    <th>Expected</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Reliability</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rentRoll.map((r) => (
                    <tr key={r.tenant.id}>
                      <td>
                        <strong>{r.tenant.name}</strong>
                        {r.tenant.autopay && <span className="autopay-badge"><RefreshCw size={10} /> Autopay</span>}
                        {r.tenant.phone && <span className="muted block">{r.tenant.phone}</span>}
                      </td>
                      <td>
                        <Link to={`/properties/${r.property.id}`} className="link-strong">{r.property.name}</Link>
                        <span className="muted"> — {r.unit.name}</span>
                      </td>
                      <td>{formatMoney(r.expectedRent)}</td>
                      <td className={r.paidAmount > 0 ? 'positive' : ''}>
                        {r.paidAmount > 0 ? formatMoney(r.paidAmount) : '—'}
                        {r.paymentDate && <span className="muted block">{formatDate(r.paymentDate)}</span>}
                      </td>
                      <td className={r.balance > 0 ? 'negative' : ''}>
                        {r.balance > 0 ? formatMoney(r.balance) : '—'}
                        {r.lateFees > 0 && <span className="muted block">+{formatMoney(r.lateFees)} fees</span>}
                      </td>
                      <td>
                        {r.paid ? (
                          <span className="badge paid">Paid</span>
                        ) : r.paidAmount > 0 ? (
                          <span className="badge partial">Partial</span>
                        ) : (
                          <span className="badge overdue">Not paid</span>
                        )}
                      </td>
                      <td>
                        {(() => {
                          const rel = getTenantReliability(r.tenant, payments, settings.defaultGracePeriodDays)
                          return (
                            <span className={`reliability-badge-inline grade-${rel.grade}`} title={`${rel.label} — ${rel.score}/100`}>
                              {rel.grade} · {rel.score}
                            </span>
                          )
                        })()}
                      </td>
                      <td>
                        {!r.paid && (
                          <button
                            type="button"
                            className="btn small primary"
                            onClick={() => {
                              setPaymentModal({ tenantId: r.tenant.id, amount: r.expectedRent, tenantName: r.tenant.name, propertyName: r.property.name, unitName: r.unit.name, expectedRent: r.expectedRent, paidAmount: r.paidAmount })
                              // Default date to within the viewed month, not necessarily today
                              const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
                              setPaymentDate(isCurrentMonth ? nowISO() : `${year}-${String(month + 1).padStart(2, '0')}-01`)
                            }}
                          >
                            Record payment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {paymentModal && (
        <div className="modal-overlay" onClick={() => setPaymentModal(null)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3><Banknote size={16} style={{ marginRight: 6, verticalAlign: '-2px' }} />Record Payment</h3>
              <button type="button" className="btn-icon" onClick={() => setPaymentModal(null)} aria-label="Close">×</button>
            </div>

            <div className="payment-tenant-banner">
              <div className="payment-tenant-avatar"><User size={18} /></div>
              <div className="payment-tenant-info">
                <strong>{paymentModal.tenantName}</strong>
                <span><Home size={11} /> {paymentModal.propertyName} — {paymentModal.unitName}</span>
              </div>
            </div>

            <div className="payment-rent-summary">
              <div className="payment-rent-stat">
                <span className="payment-rent-stat-label">Expected</span>
                <span className="payment-rent-stat-value">{formatMoney(paymentModal.expectedRent)}</span>
              </div>
              <div className="payment-rent-stat">
                <span className="payment-rent-stat-label">Paid so far</span>
                <span className={`payment-rent-stat-value ${paymentModal.paidAmount > 0 ? 'positive' : ''}`}>{formatMoney(paymentModal.paidAmount)}</span>
              </div>
              <div className="payment-rent-stat">
                <span className="payment-rent-stat-label">Remaining</span>
                <span className={`payment-rent-stat-value ${paymentModal.expectedRent - paymentModal.paidAmount > 0 ? 'negative' : 'positive'}`}>
                  {formatMoney(paymentModal.expectedRent - paymentModal.paidAmount)}
                </span>
              </div>
            </div>

            <form onSubmit={handleRecordPayment}>
              <div className="payment-form-fields">
                <label className="payment-field">
                  <span className="payment-field-label"><DollarSign size={13} /> Amount</span>
                  <input type="number" min={0} step={0.01} required value={paymentModal.amount} onChange={(e) => setPaymentModal((p) => p && { ...p, amount: +e.target.value })} />
                </label>
                <label className="payment-field">
                  <span className="payment-field-label"><Calendar size={13} /> Date</span>
                  <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </label>
                <label className="payment-field">
                  <span className="payment-field-label"><CreditCard size={13} /> Method</span>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'check' | 'transfer' | 'cash' | 'other')}>
                    <option value="check">Check</option>
                    <option value="transfer">Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setPaymentModal(null)}>Cancel</button>
                <button type="submit" className="btn primary"><Banknote size={14} /> Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkRent && (() => {
        const adjustments = tenants.map((t) => {
          const newRent = bulkRentMode === 'pct' ? Math.round(t.monthlyRent * (1 + bulkRentPct / 100)) : t.monthlyRent + bulkRentFlat
          return { id: t.id, name: t.name, oldRent: t.monthlyRent, newRent, diff: newRent - t.monthlyRent }
        }).filter((a) => a.newRent > 0)
        const totalOld = adjustments.reduce((s, a) => s + a.oldRent, 0)
        const totalNew = adjustments.reduce((s, a) => s + a.newRent, 0)
        const totalDiff = totalNew - totalOld

        return (
          <div className="modal-overlay" onClick={() => setShowBulkRent(false)}>
            <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <h3><TrendingUp size={16} style={{ marginRight: 6, verticalAlign: '-2px' }} />Bulk Rent Adjustment</h3>
                <button type="button" className="btn-icon" onClick={() => setShowBulkRent(false)} aria-label="Close">×</button>
              </div>

              <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>Adjust rent for all current tenants at once. Useful for annual increases.</p>

              <div className="bulk-mode-toggle">
                <button
                  type="button"
                  className={`bulk-mode-btn ${bulkRentMode === 'pct' ? 'active' : ''}`}
                  onClick={() => setBulkRentMode('pct')}
                >
                  <Percent size={14} /> Percentage
                </button>
                <button
                  type="button"
                  className={`bulk-mode-btn ${bulkRentMode === 'flat' ? 'active' : ''}`}
                  onClick={() => setBulkRentMode('flat')}
                >
                  <DollarSign size={14} /> Flat Amount
                </button>
              </div>

              <div className="bulk-input-row">
                {bulkRentMode === 'pct' ? (
                  <label className="bulk-input-field">
                    <span className="bulk-input-label">Increase / Decrease (%)</span>
                    <div className="bulk-input-with-unit">
                      <input type="number" min={-50} max={50} step={0.5} value={bulkRentPct} onChange={(e) => setBulkRentPct(+e.target.value)} />
                      <span className="bulk-input-unit">%</span>
                    </div>
                  </label>
                ) : (
                  <label className="bulk-input-field">
                    <span className="bulk-input-label">Increase / Decrease ($)</span>
                    <div className="bulk-input-with-unit">
                      <span className="bulk-input-unit">$</span>
                      <input type="number" min={-5000} max={5000} step={1} value={bulkRentFlat} onChange={(e) => setBulkRentFlat(+e.target.value)} />
                    </div>
                  </label>
                )}
              </div>

              <div className="bulk-summary-strip">
                <div className="bulk-summary-stat">
                  <span className="bulk-summary-stat-label"><Users size={12} /> Tenants</span>
                  <span className="bulk-summary-stat-value">{adjustments.length}</span>
                </div>
                <div className="bulk-summary-stat">
                  <span className="bulk-summary-stat-label">Current total</span>
                  <span className="bulk-summary-stat-value">{formatMoney(totalOld)}/mo</span>
                </div>
                <div className="bulk-summary-stat">
                  <span className="bulk-summary-stat-label">New total</span>
                  <span className="bulk-summary-stat-value">{formatMoney(totalNew)}/mo</span>
                </div>
                <div className="bulk-summary-stat">
                  <span className="bulk-summary-stat-label">Change</span>
                  <span className={`bulk-summary-stat-value ${totalDiff > 0 ? 'positive' : totalDiff < 0 ? 'negative' : ''}`}>
                    {totalDiff > 0 ? '+' : ''}{formatMoney(totalDiff)}
                  </span>
                </div>
              </div>

              <div className="bulk-preview-section">
                <span className="bulk-preview-heading">Preview</span>
                <div className="bulk-preview-list">
                  {adjustments.slice(0, 6).map((a) => (
                    <div key={a.id} className="bulk-preview-row">
                      <span className="bulk-preview-name">{a.name}</span>
                      <span className="bulk-preview-amounts">
                        <span className="muted">{formatMoney(a.oldRent)}</span>
                        <span className="bulk-preview-arrow">→</span>
                        <span style={{ fontWeight: 600 }}>{formatMoney(a.newRent)}</span>
                        {a.diff !== 0 && (
                          <span className={`bulk-preview-diff ${a.diff > 0 ? 'increase' : 'decrease'}`}>
                            {a.diff > 0 ? '+' : ''}{formatMoney(a.diff)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  {adjustments.length > 6 && (
                    <div className="bulk-preview-more">and {adjustments.length - 6} more tenant{adjustments.length - 6 !== 1 ? 's' : ''}</div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowBulkRent(false)}>Cancel</button>
                <button type="button" className="btn primary" onClick={handleBulkRentAdjust}>
                  <TrendingUp size={14} /> Apply to {adjustments.length} tenant{adjustments.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
