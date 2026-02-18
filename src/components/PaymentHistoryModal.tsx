import type { Tenant, Payment } from '../types'
import { formatMoney, formatDate } from '../lib/format'

interface Props {
  tenant: Tenant
  payments: Payment[]
  onClose: () => void
}

export default function PaymentHistoryModal({ tenant, payments, onClose }: Props) {
  const tenantPayments = payments
    .filter((p) => p.tenantId === tenant.id)
    .sort((a, b) => b.date.localeCompare(a.date))
  const totalPaid = tenantPayments.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Payment history for ${tenant.name}`}>
      <div className="modal card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Payment history — {tenant.name}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Total paid: <strong className="positive">{formatMoney(totalPaid)}</strong> across {tenantPayments.length} payment{tenantPayments.length !== 1 ? 's' : ''}
        </p>
        {tenantPayments.length === 0 ? (
          <p className="empty-state">No payments recorded for this tenant.</p>
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
                    <td className="muted">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</td>
                    <td className="muted">{p.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
