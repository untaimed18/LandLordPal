import { useState } from 'react'
import { Tenant } from '../types'
import { updateTenant } from '../store'
import { useToast } from '../context/ToastContext'
import { nowISO } from '../lib/id'
import { formatMoney } from '../lib/format'

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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Renew Lease — {tenant.name}</h2>
          <button type="button" className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="muted" style={{ marginBottom: '1rem' }}>
              Current Lease: {tenant.leaseStart} to {tenant.leaseEnd} ({formatMoney(tenant.monthlyRent)})
            </p>
            <div className="form-grid">
              <label>New Lease Start <input type="date" required value={form.leaseStart} onChange={(e) => setForm({ ...form, leaseStart: e.target.value })} /></label>
              <label>New Lease End <input type="date" required value={form.leaseEnd} onChange={(e) => setForm({ ...form, leaseEnd: e.target.value })} /></label>
              <label>New Monthly Rent <input type="number" min={0} required value={form.monthlyRent} onChange={(e) => setForm({ ...form, monthlyRent: +e.target.value })} /></label>
            </div>
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
