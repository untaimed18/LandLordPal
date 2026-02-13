import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { getRentRollForMonth } from '../lib/calculations'
import { addPayment } from '../store'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatDate, formatMonthYear } from '../lib/format'
import { nowISO } from '../lib/id'
import { toCSV, downloadCSV } from '../lib/csv'

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
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [paymentModal, setPaymentModal] = useState<{ tenantId: string; amount: number } | null>(null)
  const [paymentDate, setPaymentDate] = useState(nowISO())
  const [paymentMethod, setPaymentMethod] = useState<'check' | 'transfer' | 'cash' | 'other'>('transfer')

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

  function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!paymentModal) return
    const tenant = tenants.find((t) => t.id === paymentModal.tenantId)
    if (!tenant) return
    const d = new Date(paymentDate + 'T12:00:00')
    addPayment({
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
  }

  return (
    <div className="page rent-income-page">
      <div className="page-header">
        <div>
          <h1>Rent & income</h1>
          <p className="page-desc">See who has paid this month and record rent payments.</p>
        </div>
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
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rentRoll.map((r) => (
                    <tr key={r.tenant.id}>
                      <td>
                        <strong>{r.tenant.name}</strong>
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
                        {!r.paid && (
                          <button
                            type="button"
                            className="btn small primary"
                            onClick={() => {
                              setPaymentModal({ tenantId: r.tenant.id, amount: r.expectedRent })
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
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Record rent payment</h3>
              <button type="button" className="btn-icon" onClick={() => setPaymentModal(null)} aria-label="Close">×</button>
            </div>
            <form onSubmit={handleRecordPayment}>
              <div className="form-grid">
                <label>
                  Tenant
                  <div className="form-static">{tenants.find((t) => t.id === paymentModal.tenantId)?.name}</div>
                </label>
                <label>Amount * <input type="number" min={0} step={0.01} required value={paymentModal.amount} onChange={(e) => setPaymentModal((p) => p && { ...p, amount: +e.target.value })} /></label>
                <label>Date * <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></label>
                <label>Method <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}><option value="check">Check</option><option value="transfer">Transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn primary">Record payment</button>
                <button type="button" className="btn" onClick={() => setPaymentModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
