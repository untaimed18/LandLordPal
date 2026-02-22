import { useState, useMemo } from 'react'
import { addTenant, updateTenant, updateUnit } from '../../store'
import { useToast } from '../../context/ToastContext'
import { formatDate, formatPhoneNumber, formatMoney } from '../../lib/format'
import { useFormValidation } from '../../hooks/useFormValidation'
import { tenantSchema } from '../../lib/schemas'
import { loadSettings } from '../../lib/settings'
import { RefreshCw, ShieldCheck, DollarSign } from 'lucide-react'
import type { Tenant } from '../../types'

interface TenantFormData {
  unitId: string
  name: string
  email: string
  phone: string
  leaseStart: string
  leaseEnd: string
  monthlyRent: number
  deposit: number
  gracePeriodDays: number
  lateFeeAmount: number
  autopay: boolean
  notes: string
  requireFirstMonth: boolean
  requireLastMonth: boolean
}

interface Props {
  propertyId: string
  unitName?: string
  tenants: Tenant[]
  editingTenantId: string | null
  initial: TenantFormData
  onClose: () => void
}

export default function TenantForm({ propertyId, unitName, tenants, editingTenantId, initial, onClose }: Props) {
  const toast = useToast()
  const settings = loadSettings()
  const [form, setForm] = useState<TenantFormData>({
    ...initial,
    requireFirstMonth: initial.requireFirstMonth ?? settings.requireFirstMonth,
    requireLastMonth: initial.requireLastMonth ?? settings.requireLastMonth,
  })
  const { errors, validate, clearError } = useFormValidation(tenantSchema)

  const moveInTotal = useMemo(() => {
    let total = 0
    if (form.deposit > 0) total += form.deposit
    if (form.requireFirstMonth && form.monthlyRent > 0) total += form.monthlyRent
    if (form.requireLastMonth && form.monthlyRent > 0) total += form.monthlyRent
    return total
  }, [form.deposit, form.monthlyRent, form.requireFirstMonth, form.requireLastMonth])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.unitId) return

    const payload = {
      unitId: form.unitId,
      propertyId,
      name: form.name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      leaseStart: form.leaseStart,
      leaseEnd: form.leaseEnd,
      monthlyRent: form.monthlyRent,
      deposit: form.deposit || undefined,
      gracePeriodDays: form.gracePeriodDays || undefined,
      lateFeeAmount: form.lateFeeAmount || undefined,
      notes: form.notes || undefined,
    }
    if (!validate(payload)) return

    const overlapping = tenants.find(
      (t) => t.unitId === form.unitId && t.id !== editingTenantId &&
        t.leaseStart <= form.leaseEnd && t.leaseEnd >= form.leaseStart
    )
    if (overlapping) {
      toast(`Lease overlaps with "${overlapping.name}" (${formatDate(overlapping.leaseStart)} – ${formatDate(overlapping.leaseEnd)})`, 'error')
      return
    }

    const data = {
      name: form.name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      leaseStart: form.leaseStart,
      leaseEnd: form.leaseEnd,
      monthlyRent: form.monthlyRent,
      deposit: form.deposit || undefined,
      gracePeriodDays: form.gracePeriodDays || undefined,
      lateFeeAmount: form.lateFeeAmount || undefined,
      autopay: form.autopay,
      notes: form.notes || undefined,
      requireFirstMonth: form.requireFirstMonth,
      requireLastMonth: form.requireLastMonth,
    }

    try {
      if (editingTenantId) {
        await updateTenant(editingTenantId, data)
        toast('Tenant updated')
      } else {
        await addTenant({
          ...data,
          propertyId,
          unitId: form.unitId,
          moveInDate: form.leaseStart,
          depositStatus: form.deposit > 0 ? 'pending' : undefined,
        })
        await updateUnit(form.unitId, { available: false })
        toast('Tenant added')
      }
      onClose()
    } catch {
      toast('Failed to save tenant', 'error')
    }
  }

  const isEdit = !!editingTenantId
  const title = isEdit ? 'Edit tenant' : `Add tenant${unitName ? ` — ${unitName}` : ''}`

  return (
    <form className="card form-card" onSubmit={handleSubmit}>
      <h3>{title}</h3>
      {!isEdit && <input type="hidden" value={form.unitId} />}
      <div className="form-grid">
        <label className={errors.name ? 'form-field-error' : ''}>Name * <input required value={form.name} onChange={(e) => { setForm((n) => ({ ...n, name: e.target.value })); clearError('name') }} />{errors.name && <span className="field-error" role="alert">{errors.name}</span>}</label>
        <label className={errors.email ? 'form-field-error' : ''}>Email <input type="email" value={form.email} onChange={(e) => { setForm((n) => ({ ...n, email: e.target.value })); clearError('email') }} />{errors.email && <span className="field-error" role="alert">{errors.email}</span>}</label>
        <label className={errors.phone ? 'form-field-error' : ''}>Phone <input type="tel" value={form.phone} onChange={(e) => { setForm((n) => ({ ...n, phone: formatPhoneNumber(e.target.value) })); clearError('phone') }} placeholder="(555) 123-4567" />{errors.phone && <span className="field-error" role="alert">{errors.phone}</span>}</label>
        <label className={errors.leaseStart ? 'form-field-error' : ''}>Lease start * <input type="date" required value={form.leaseStart} onChange={(e) => { setForm((n) => ({ ...n, leaseStart: e.target.value })); clearError('leaseStart') }} />{errors.leaseStart && <span className="field-error" role="alert">{errors.leaseStart}</span>}</label>
        <label className={errors.leaseEnd ? 'form-field-error' : ''}>Lease end * <input type="date" required value={form.leaseEnd} onChange={(e) => { setForm((n) => ({ ...n, leaseEnd: e.target.value })); clearError('leaseEnd') }} />{errors.leaseEnd && <span className="field-error" role="alert">{errors.leaseEnd}</span>}</label>
        <label className={errors.monthlyRent ? 'form-field-error' : ''}>Monthly rent * <input type="number" min={0} required value={form.monthlyRent || ''} onChange={(e) => { setForm((n) => ({ ...n, monthlyRent: +e.target.value })); clearError('monthlyRent') }} />{errors.monthlyRent && <span className="field-error" role="alert">{errors.monthlyRent}</span>}</label>
        <label>Grace period (days) <input type="number" min={0} value={form.gracePeriodDays || ''} onChange={(e) => setForm((n) => ({ ...n, gracePeriodDays: +e.target.value }))} /></label>
        <label>Late fee <input type="number" min={0} step={0.01} value={form.lateFeeAmount || ''} onChange={(e) => setForm((n) => ({ ...n, lateFeeAmount: +e.target.value }))} /></label>
      </div>
      <fieldset className="form-fieldset" style={{ marginTop: '0.75rem' }}>
        <legend><ShieldCheck size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Move-In Costs</legend>
        <div className="form-grid">
          <label>Security deposit <input type="number" min={0} value={form.deposit || ''} onChange={(e) => setForm((n) => ({ ...n, deposit: +e.target.value }))} /></label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          <label className={`toggle-card compact${form.requireFirstMonth ? ' active' : ''}`}>
            <input type="checkbox" checked={form.requireFirstMonth} onChange={(e) => setForm((n) => ({ ...n, requireFirstMonth: e.target.checked }))} />
            <span className="toggle-card-text">
              <span className="toggle-card-label">First month's rent at move-in</span>
            </span>
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
          <label className={`toggle-card compact${form.requireLastMonth ? ' active' : ''}`}>
            <input type="checkbox" checked={form.requireLastMonth} onChange={(e) => setForm((n) => ({ ...n, requireLastMonth: e.target.checked }))} />
            <span className="toggle-card-text">
              <span className="toggle-card-label">Last month's rent at move-in</span>
            </span>
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
        {moveInTotal > 0 && (
          <div className="movein-total-banner">
            <DollarSign size={14} />
            <span>Total move-in cost: <strong>{formatMoney(moveInTotal)}</strong></span>
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              ({[
                form.deposit > 0 ? `${formatMoney(form.deposit)} deposit` : '',
                form.requireFirstMonth ? `${formatMoney(form.monthlyRent)} first mo.` : '',
                form.requireLastMonth ? `${formatMoney(form.monthlyRent)} last mo.` : '',
              ].filter(Boolean).join(' + ')})
            </span>
          </div>
        )}
      </fieldset>
      <label className={`toggle-card${form.autopay ? ' active' : ''}`}>
        <input type="checkbox" checked={form.autopay} onChange={(e) => setForm((n) => ({ ...n, autopay: e.target.checked }))} />
        <span className="toggle-card-icon"><RefreshCw size={18} /></span>
        <span className="toggle-card-text">
          <span className="toggle-card-label">Autopay</span>
          <span className="toggle-card-desc">Tenant pays automatically each month</span>
        </span>
        <span className="toggle-track"><span className="toggle-thumb" /></span>
      </label>
      <label>Notes <textarea value={form.notes} onChange={(e) => setForm((n) => ({ ...n, notes: e.target.value }))} rows={2} /></label>
      <div className="form-actions">
        <button type="submit" className="btn primary">{isEdit ? 'Save changes' : 'Save tenant'}</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  )
}

export type { TenantFormData }
