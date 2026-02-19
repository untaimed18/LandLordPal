import { useState } from 'react'
import { updateProperty } from '../../store'
import { useToast } from '../../context/ToastContext'
import { useFormValidation } from '../../hooks/useFormValidation'
import { propertySchema } from '../../lib/schemas'
import { US_STATES } from '../../lib/us-states'
import type { Property, PropertyType } from '../../types'

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'single_family', label: 'Single Family' },
  { value: 'multi_family', label: 'Multi Family' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' },
]

const COMMON_AMENITIES = [
  'Parking', 'Garage', 'Pool', 'Laundry', 'Dishwasher', 'AC', 'Heating',
  'Balcony', 'Patio', 'Yard', 'Storage', 'Gym', 'Pet Friendly', 'Elevator',
]

function formatNumberWithCommas(value: string): string {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

interface Props {
  property: Property
  onClose: () => void
}

export default function PropertyEditForm({ property, onClose }: Props) {
  const toast = useToast()
  const { errors, validate, clearError } = useFormValidation(propertySchema)
  const [form, setForm] = useState({
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    propertyType: property.propertyType ?? '' as string,
    sqft: property.sqft ?? 0,
    amenities: property.amenities ?? [] as string[],
    notes: property.notes ?? '',
    purchasePrice: property.purchasePrice ?? 0,
    purchaseDate: property.purchaseDate ?? '',
    insuranceProvider: property.insuranceProvider ?? '',
    insurancePolicyNumber: property.insurancePolicyNumber ?? '',
    insuranceExpiry: property.insuranceExpiry ?? '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: form.name,
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      propertyType: (form.propertyType as PropertyType) || undefined,
      sqft: form.sqft || undefined,
      amenities: form.amenities.length > 0 ? form.amenities : undefined,
      purchasePrice: form.purchasePrice || undefined,
      purchaseDate: form.purchaseDate || undefined,
      insuranceProvider: form.insuranceProvider || undefined,
      insurancePolicyNumber: form.insurancePolicyNumber || undefined,
      insuranceExpiry: form.insuranceExpiry || undefined,
      notes: form.notes || undefined,
    }
    if (!validate(payload)) return
    updateProperty(property.id, {
      name: form.name,
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      propertyType: (form.propertyType as PropertyType) || undefined,
      sqft: form.sqft || undefined,
      amenities: form.amenities.length > 0 ? form.amenities : undefined,
      purchasePrice: form.purchasePrice || undefined,
      purchaseDate: form.purchaseDate || undefined,
      insuranceProvider: form.insuranceProvider || undefined,
      insurancePolicyNumber: form.insurancePolicyNumber || undefined,
      insuranceExpiry: form.insuranceExpiry || undefined,
      notes: form.notes || undefined,
    })
    onClose()
    toast('Property updated')
  }

  return (
    <form className="card form-card inline-form" onSubmit={handleSubmit}>
      <h3>Edit property</h3>
      <div className="form-grid">
        <label className={errors.name ? 'form-field-error' : ''}>Name * <input required value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); clearError('name') }} />{errors.name && <span className="field-error" role="alert">{errors.name}</span>}</label>
        <label className={errors.address ? 'form-field-error' : ''}>Address * <input required value={form.address} onChange={(e) => { setForm((f) => ({ ...f, address: e.target.value })); clearError('address') }} />{errors.address && <span className="field-error" role="alert">{errors.address}</span>}</label>
        <label className={errors.city ? 'form-field-error' : ''}>City * <input required value={form.city} onChange={(e) => { setForm((f) => ({ ...f, city: e.target.value })); clearError('city') }} />{errors.city && <span className="field-error" role="alert">{errors.city}</span>}</label>
        <label className={errors.state ? 'form-field-error' : ''}>State * <select required value={form.state} onChange={(e) => { setForm((f) => ({ ...f, state: e.target.value })); clearError('state') }}>
          <option value="">Select state</option>
          {US_STATES.map((s) => <option key={s.value} value={s.value}>{s.value} — {s.label}</option>)}
        </select>{errors.state && <span className="field-error" role="alert">{errors.state}</span>}</label>
        <label className={errors.zip ? 'form-field-error' : ''}>ZIP * <input required value={form.zip} onChange={(e) => { setForm((f) => ({ ...f, zip: e.target.value })); clearError('zip') }} />{errors.zip && <span className="field-error" role="alert">{errors.zip}</span>}</label>
        <label>Property type <select value={form.propertyType} onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))}>
          <option value="">Select type</option>
          {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select></label>
        <label>Total sq ft <input type="number" min={0} value={form.sqft || ''} onChange={(e) => setForm((f) => ({ ...f, sqft: +e.target.value || 0 }))} /></label>
        <label>Purchase price <input type="text" inputMode="numeric" value={form.purchasePrice ? formatNumberWithCommas(String(form.purchasePrice)) : ''} onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ''); setForm((f) => ({ ...f, purchasePrice: raw ? Number(raw) : 0 })) }} /></label>
        <label>Purchase date <input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} /></label>
      </div>
      <div style={{ marginTop: '0.75rem' }}>
        <label>Amenities</label>
        <div className="amenity-chips">
          {COMMON_AMENITIES.map((a) => (
            <button key={a} type="button" className={`amenity-chip ${form.amenities.includes(a) ? 'active' : ''}`}
              onClick={() => setForm((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] }))}>{a}</button>
          ))}
        </div>
      </div>
      <fieldset className="form-fieldset" style={{ marginTop: '0.75rem' }}>
        <legend>Insurance</legend>
        <div className="form-grid">
          <label>Provider <input value={form.insuranceProvider} onChange={(e) => setForm((f) => ({ ...f, insuranceProvider: e.target.value }))} placeholder="e.g. State Farm" /></label>
          <label>Policy # <input value={form.insurancePolicyNumber} onChange={(e) => setForm((f) => ({ ...f, insurancePolicyNumber: e.target.value }))} /></label>
          <label>Expiry date <input type="date" value={form.insuranceExpiry} onChange={(e) => setForm((f) => ({ ...f, insuranceExpiry: e.target.value }))} /></label>
        </div>
      </fieldset>
      <label style={{ marginTop: '0.75rem' }}>Notes <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} /></label>
      <div className="form-actions">
        <button type="submit" className="btn primary">Save</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  )
}
