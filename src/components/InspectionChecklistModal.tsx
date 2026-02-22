import { useState } from 'react'
import { updateTenant } from '../store'
import { useToast } from '../context/ToastContext'
import { nowISO } from '../lib/id'
import { ClipboardList, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import type { Tenant, InspectionChecklist, InspectionItem, InspectionCondition } from '../types'

const DEFAULT_AREAS = [
  'Living Room', 'Kitchen', 'Bathroom', 'Bedroom 1', 'Bedroom 2',
  'Hallway', 'Closets', 'Windows', 'Doors', 'Floors',
  'Walls/Ceiling', 'Appliances', 'HVAC/Heating', 'Plumbing', 'Exterior',
]

const CONDITIONS: { value: InspectionCondition; label: string; color: string }[] = [
  { value: 'excellent', label: 'Excellent', color: 'condition-excellent' },
  { value: 'good', label: 'Good', color: 'condition-good' },
  { value: 'fair', label: 'Fair', color: 'condition-fair' },
  { value: 'poor', label: 'Poor', color: 'condition-poor' },
  { value: 'damaged', label: 'Damaged', color: 'condition-damaged' },
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
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  function updateItem(idx: number, patch: Partial<InspectionItem>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  function addArea() {
    if (!customArea.trim()) return
    const newIdx = items.length
    setItems((prev) => [...prev, { area: customArea.trim(), condition: 'good', notes: '' }])
    setCustomArea('')
    setExpandedIdx(newIdx)
  }

  function removeArea(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
    if (expandedIdx === idx) setExpandedIdx(null)
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1)
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

  const conditionSummary = CONDITIONS.map((c) => ({
    ...c,
    count: items.filter((item) => item.condition === c.value).length,
  })).filter((c) => c.count > 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h3>
            <ClipboardList size={16} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            {type === 'move_in' ? 'Move-In' : 'Move-Out'} Inspection — {tenant.name}
          </h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="inspect-meta-row">
          <label className="inspect-date-field">
            <span className="inspect-field-label">Inspection Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="inspect-summary-pills">
            {conditionSummary.map((c) => (
              <span key={c.value} className={`inspect-summary-pill ${c.color}`}>{c.count} {c.label}</span>
            ))}
          </div>
        </div>

        <div className="inspect-items-list">
          {items.map((item, i) => (
            <div key={i} className={`inspect-item ${expandedIdx === i ? 'expanded' : ''}`}>
              <div className="inspect-item-header" onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
                <span className="inspect-item-area">{item.area}</span>
                <div className="inspect-item-header-right">
                  <span className={`inspect-condition-badge ${CONDITIONS.find((c) => c.value === item.condition)?.color ?? ''}`}>
                    {CONDITIONS.find((c) => c.value === item.condition)?.label}
                  </span>
                  {expandedIdx === i ? <ChevronUp size={14} className="inspect-chevron" /> : <ChevronDown size={14} className="inspect-chevron" />}
                </div>
              </div>
              {expandedIdx === i && (
                <div className="inspect-item-body">
                  <div className="inspect-condition-row">
                    {CONDITIONS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        className={`inspect-condition-pill ${c.color} ${item.condition === c.value ? 'active' : ''}`}
                        onClick={() => updateItem(i, { condition: c.value })}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="inspect-note-input"
                    value={item.notes}
                    onChange={(e) => updateItem(i, { notes: e.target.value })}
                    placeholder="Add notes for this area..."
                  />
                  <button type="button" className="inspect-remove-btn" onClick={() => removeArea(i)}>
                    <Trash2 size={12} /> Remove area
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="inspect-add-row">
          <input
            value={customArea}
            onChange={(e) => setCustomArea(e.target.value)}
            placeholder="Add custom area..."
            className="inspect-add-input"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea() } }}
          />
          <button type="button" className="btn small" onClick={addArea} disabled={!customArea.trim()}>
            <Plus size={14} /> Add
          </button>
        </div>

        <label className="inspect-general-notes">
          <span className="inspect-field-label">General Notes</span>
          <textarea
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            rows={3}
            placeholder="Overall condition, special observations, photos taken..."
          />
        </label>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={handleSave}>
            <ClipboardList size={14} /> Save Inspection
          </button>
        </div>
      </div>
    </div>
  )
}
