import { useState, useMemo } from 'react'
import { Tenant } from '../types'
import { updateTenant } from '../store'
import { useToast } from '../context/ToastContext'
import { nowISO } from '../lib/id'
import { formatMoney, formatDate } from '../lib/format'
import { CalendarDays, DollarSign, TrendingUp, TrendingDown, ArrowRight, RotateCw } from 'lucide-react'

interface Props {
  tenant: Tenant
  onClose: () => void
}

export default function LeaseRenewalModal({ tenant, onClose }: Props) {
  const toast = useToast()
  const [form, setForm] = useState({
    leaseStart: '',
    leaseEnd: '',
    monthlyRent: tenant.monthlyRent,
  })

  const rentChange = useMemo(() => {
    const diff = form.monthlyRent - tenant.monthlyRent
    const pct = tenant.monthlyRent > 0 ? (diff / tenant.monthlyRent) * 100 : 0
    return { diff, pct }
  }, [form.monthlyRent, tenant.monthlyRent])

  const newLeaseDays = useMemo(() => {
    if (!form.leaseStart || !form.leaseEnd) return null
    const start = new Date(form.leaseStart + 'T12:00:00')
    const end = new Date(form.leaseEnd + 'T12:00:00')
    const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    return days > 0 ? days : null
  }, [form.leaseStart, form.leaseEnd])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (form.leaseEnd <= form.leaseStart) {
      toast('Lease end date must be after the start date', 'error')
      return
    }
    
    const oldLease = {
      startDate: tenant.leaseStart,
      endDate: tenant.leaseEnd,
      monthlyRent: tenant.monthlyRent,
      renewedAt: nowISO(),
    }
    
    const leaseHistory = [...(tenant.leaseHistory ?? []), oldLease]

    try {
      await updateTenant(tenant.id, {
        leaseStart: form.leaseStart,
        leaseEnd: form.leaseEnd,
        monthlyRent: form.monthlyRent,
        leaseHistory,
      })
      toast('Lease renewed successfully')
      onClose()
    } catch {
      toast('Failed to renew lease', 'error')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3><RotateCw size={16} style={{ marginRight: 6, verticalAlign: '-2px' }} />Renew Lease — {tenant.name}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="renewal-current-lease">
          <span className="renewal-current-label">Current Lease</span>
          <div className="renewal-current-details">
            <span><CalendarDays size={13} /> {formatDate(tenant.leaseStart)} — {formatDate(tenant.leaseEnd)}</span>
            <span><DollarSign size={13} /> {formatMoney(tenant.monthlyRent)}/mo</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="renewal-form-section">
            <span className="renewal-form-label">New Lease Terms</span>
            <div className="renewal-date-row">
              <label className="renewal-field">
                <span className="renewal-field-label">Start date</span>
                <input type="date" required value={form.leaseStart} onChange={(e) => setForm({ ...form, leaseStart: e.target.value })} />
              </label>
              <div className="renewal-date-arrow"><ArrowRight size={16} /></div>
              <label className="renewal-field">
                <span className="renewal-field-label">End date</span>
                <input type="date" required value={form.leaseEnd} onChange={(e) => setForm({ ...form, leaseEnd: e.target.value })} />
              </label>
            </div>
            {newLeaseDays && (
              <span className="renewal-duration-hint">{Math.floor(newLeaseDays / 30)} month{Math.floor(newLeaseDays / 30) !== 1 ? 's' : ''} ({newLeaseDays} days)</span>
            )}

            <label className="renewal-field" style={{ marginTop: '0.75rem' }}>
              <span className="renewal-field-label">Monthly rent</span>
              <div className="renewal-rent-input-row">
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={form.monthlyRent}
                  onChange={(e) => setForm({ ...form, monthlyRent: +e.target.value })}
                />
                {rentChange.diff !== 0 && (
                  <span className={`renewal-rent-change ${rentChange.diff > 0 ? 'increase' : 'decrease'}`}>
                    {rentChange.diff > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {rentChange.diff > 0 ? '+' : ''}{formatMoney(rentChange.diff)} ({rentChange.pct > 0 ? '+' : ''}{rentChange.pct.toFixed(1)}%)
                  </span>
                )}
              </div>
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary">Renew Lease</button>
          </div>
        </form>
      </div>
    </div>
  )
}
