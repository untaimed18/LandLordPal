import type { Payment, Tenant } from '../types'
import { formatMoney, formatDate } from '../lib/format'

interface Props {
  payments: Payment[]
  tenants: Tenant[]
  onDelete: (id: string) => void
}

export default function RecentPayments({ payments, tenants, onDelete }: Props) {
  return (
    <section className="card section-card" aria-label="Recent payments">
      <h2>Recent payments</h2>
      {payments.length === 0 ? (
        <p className="empty-state">No payments recorded yet.</p>
      ) : (
        <table className="data-table">
          <thead><tr><th>Date</th><th>Tenant</th><th>Amount</th><th>Method</th><th>Notes</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {payments
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 10)
              .map((p) => {
                const t = tenants.find((x) => x.id === p.tenantId)
                return (
                  <tr key={p.id}>
                    <td>{formatDate(p.date)}</td>
                    <td>{t?.name ?? '—'}</td>
                    <td className="positive">{formatMoney(p.amount)}</td>
                    <td>{p.method ?? '—'}</td>
                    <td className="muted">{p.notes ?? ''}</td>
                    <td><button type="button" className="btn small" onClick={() => onDelete(p.id)}>Delete</button></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      )}
    </section>
  )
}
