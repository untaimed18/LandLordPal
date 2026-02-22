import { useState, useMemo } from 'react'
import { addPayment, updateTenant } from '../../store'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { formatMoney } from '../../lib/format'
import { loadSettings } from '../../lib/settings'
import type { Tenant, Payment, PaymentCategory } from '../../types'

function startOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function endOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

interface Props {
  propertyId: string
  tenants: Tenant[]
  payments: Payment[]
  initialTenantId: string
  initialAmount: number
  initialDate: string
  onClose: () => void
}

export default function RecordPaymentForm({ propertyId, tenants, payments, initialTenantId, initialAmount, initialDate, onClose }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const settings = loadSettings()
  const [form, setForm] = useState({
    tenantId: initialTenantId,
    amount: initialAmount,
    date: initialDate,
    method: 'transfer' as 'check' | 'transfer' | 'cash' | 'other',
    category: 'rent' as PaymentCategory,
    notes: '',
    lateFee: 0,
  })

  const lateInfo = useMemo(() => {
    const t = tenants.find((x) => x.id === form.tenantId)
    if (!t || !form.date) return null
    const day = parseInt(form.date.split('-')[2], 10)
    const grace = t.gracePeriodDays ?? settings.defaultGracePeriodDays
    const fee = t.lateFeeAmount ?? 0
    if (day > grace && fee > 0) return { day, grace, fee }
    return null
  }, [form.tenantId, form.date, tenants, settings.defaultGracePeriodDays])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = tenants.find((x) => x.id === form.tenantId)
    if (!t) return
    
    const [y, m, d] = form.date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    
    const payMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`
    const existing = payments.find(
      (p) => p.tenantId === t.id && p.date.startsWith(payMonth)
    )
    if (existing) {
      const ok = await confirm({
        title: 'Possible duplicate',
        message: `A payment of ${formatMoney(existing.amount)} was already recorded for ${t.name} in ${payMonth}. Record another payment anyway?`,
        confirmText: 'Record anyway',
      })
      if (!ok) return
    }
    
    try {
      await addPayment({
        propertyId,
        unitId: t.unitId,
        tenantId: t.id,
        amount: form.amount,
        date: form.date,
        periodStart: startOfMonth(dateObj),
        periodEnd: endOfMonth(dateObj),
        method: form.method,
        category: form.category !== 'rent' ? form.category : undefined,
        notes: form.notes || undefined,
        lateFee: form.lateFee > 0 ? form.lateFee : undefined,
      })
      if (form.category === 'deposit') {
        const prevPaid = t.depositPaidAmount ?? 0
        const totalPaid = prevPaid + form.amount
        const depositOwed = t.deposit ?? 0
        await updateTenant(t.id, {
          depositPaidAmount: totalPaid,
          depositPaidDate: form.date,
          depositStatus: totalPaid >= depositOwed ? 'paid' : 'partial',
        })
      }
      if (form.category === 'last_month') {
        await updateTenant(t.id, { lastMonthPaid: true })
      }
      onClose()
      toast('Payment recorded')
    } catch {
      toast('Failed to record payment', 'error')
    }
  }

  return (
    <form className="card form-card" onSubmit={handleSubmit}>
      <h3>Record {form.category === 'deposit' ? 'deposit' : form.category === 'last_month' ? "last month's rent" : form.category === 'fee' ? 'fee' : 'rent'} payment</h3>
      <div className="form-grid">
        <label>
          Tenant
          <select
            required
            value={form.tenantId}
            onChange={(e) => {
              const t = tenants.find((x) => x.id === e.target.value)
              setForm((p) => ({ ...p, tenantId: e.target.value, amount: t?.monthlyRent ?? 0, lateFee: 0, category: 'rent' }))
            }}
          >
            <option value="">Select tenant</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.monthlyRent)}</option>
            ))}
          </select>
        </label>
        <label>Amount * <input type="number" min={0} step={0.01} required value={form.amount || ''} onChange={(e) => setForm((p) => ({ ...p, amount: +e.target.value }))} /></label>
        <label>Date * <input type="date" required value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></label>
        <label>Type
          <select value={form.category} onChange={(e) => {
            const cat = e.target.value as PaymentCategory
            const t = tenants.find((x) => x.id === form.tenantId)
            let amount = form.amount
            if (cat === 'deposit' && t?.deposit) amount = t.deposit - (t.depositPaidAmount ?? 0)
            else if (cat === 'last_month' && t) amount = t.monthlyRent
            else if (cat === 'rent' && t) amount = t.monthlyRent
            setForm((p) => ({ ...p, category: cat, amount }))
          }}>
            <option value="rent">Rent</option>
            <option value="deposit">Security Deposit</option>
            <option value="last_month">Last Month's Rent</option>
            <option value="fee">Fee</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Method <select value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value as 'check' | 'transfer' | 'cash' | 'other' }))}><option value="check">Check</option><option value="transfer">Transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
      </div>
      {lateInfo && (
        <div className="late-fee-notice">
          <span><strong>Late payment detected</strong> — Day {lateInfo.day} is past the {lateInfo.grace}-day grace period. Suggested late fee: {formatMoney(lateInfo.fee)}.</span>
          {form.lateFee === 0 && (
            <button type="button" className="btn small" onClick={() => setForm((p) => ({ ...p, lateFee: lateInfo.fee }))}>
              Apply fee
            </button>
          )}
        </div>
      )}
      <div className="form-grid">
        <label>Late Fee <input type="number" min={0} step={0.01} value={form.lateFee || ''} onChange={(e) => setForm((p) => ({ ...p, lateFee: +e.target.value }))} placeholder="0.00" /></label>
        <label>Notes <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="e.g. Check #1234, partial payment" /></label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn primary">Record payment</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  )
}
