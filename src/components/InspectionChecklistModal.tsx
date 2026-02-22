import { useState } from 'react'
import { updateTenant } from '../store'
import { useToast } from '../context/ToastContext'
import { nowISO } from '../lib/id'
import type { Tenant, InspectionChecklist, InspectionItem, InspectionCondition } from '../types'

const DEFAULT_AREAS = [
  'Living Room', 'Kitchen', 'Bathroom', 'Bedroom 1', 'Bedroom 2',
  'Hallway', 'Closets', 'Windows', 'Doors', 'Floors',
  'Walls/Ceiling', 'Appliances', 'HVAC/Heating', 'Plumbing', 'Exterior',
]

const CONDITIONS: { value: InspectionCondition; label: string }[] = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'damaged', label: 'Damaged' },
]

interface Props {
  tenant: Tenant
  type: 'move_in' | 'move_out'
  onClose: () => void
}

export default function InspectionChecklistModal({ tenant, type, onClose }: Props) {
  const toast = useToast()
  const [date, setDate] = useState(nowISO())
  const [items, setItems] = useState<InspectionItem[]>(
    DEFAULT_AREAS.map((area) => ({ area, condition: 'good', notes: '' }))
  )
  const [generalNotes, setGeneralNotes] = useState('')
  const [customArea, setCustomArea] = useState('')

  function updateItem(idx: number, patch: Partial<InspectionItem>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  function addArea() {
    if (!customArea.trim()) return
    setItems((prev) => [...prev, { area: customArea.trim(), condition: 'good', notes: '' }])
    setCustomArea('')
  }

  function removeArea(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    const checklist: InspectionChecklist = { type, date, items, generalNotes }
    const existing = tenant.inspections ?? []
    try {
      await updateTenant(tenant.id, { inspections: [...existing, checklist] })
      toast(`${type === 'move_in' ? 'Move-in' : 'Move-out'} inspection saved`)
      onClose()
    } catch {
      toast('Failed to save inspection', 'error')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2>{type === 'move_in' ? 'Move-In' : 'Move-Out'} Inspection</h2>
          <button type="button" className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            Inspection Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', marginTop: '0.25rem' }} />
          </label>

          <div className="table-wrap" style={{ marginBottom: '1rem' }}>
            <table className="data-table">
              <thead>
                <tr><th>Area</th><th>Condition</th><th>Notes</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{item.area}</td>
                    <td>
                      <select value={item.condition} onChange={(e) => updateItem(i, { condition: e.target.value as InspectionCondition })}>
                        {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input value={item.notes} onChange={(e) => updateItem(i, { notes: e.target.value })} placeholder="Notes..." style={{ width: '100%' }} />
                    </td>
                    <td>
                      <button type="button" className="btn small danger" onClick={() => removeArea(i)} title="Remove">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input value={customArea} onChange={(e) => setCustomArea(e.target.value)} placeholder="Add custom area..." style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea() } }} />
            <button type="button" className="btn small" onClick={addArea}>Add Area</button>
          </div>

          <label style={{ display: 'block' }}>
            General Notes
            <textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={3} style={{ width: '100%', marginTop: '0.25rem' }} placeholder="Overall condition, special notes..." />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={handleSave}>Save Inspection</button>
        </div>
      </div>
    </div>
  )
}
