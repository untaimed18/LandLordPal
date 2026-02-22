import { useState } from 'react'
import { Tenant, Property, Unit, EmailTemplate } from '../types'
import { addCommunicationLog } from '../store'
import { processTemplate } from '../lib/email'
import { formatMoney } from '../lib/format'
import { nowISO } from '../lib/id'
import { useToast } from '../context/ToastContext'

interface Props {
  tenant: Tenant
  property: Property
  unit: Unit
  templates: EmailTemplate[]
  onClose: () => void
}

export default function EmailTemplateModal({ tenant, property, unit, templates, onClose }: Props) {
  const toast = useToast()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  
  const template = templates.find(t => t.id === selectedTemplateId)
  
  const data = {
    tenantName: tenant.name,
    unitName: unit.name,
    propertyName: property.name,
    rentAmount: formatMoney(tenant.monthlyRent),
    dueDate: '1st of the month'
  }

  const subject = template ? processTemplate(template.subject, data) : ''
  const body = template ? processTemplate(template.body, data) : ''

  async function handleSend() {
    if (!template) return
    const mailto = `mailto:${tenant.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailto, '_blank')

    try {
      await addCommunicationLog({
        tenantId: tenant.id,
        propertyId: tenant.propertyId,
        type: 'email',
        date: nowISO(),
        subject,
        notes: `Sent via template "${template.name}"`,
      })
    } catch {
      toast('Email opened but failed to log communication', 'error')
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Send Email to {tenant.name}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            Select Template
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              <option value="">-- Choose a template --</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          {template && (
            <div className="email-preview" style={{ background: 'var(--bg)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ marginBottom: '0.5rem' }}><strong>To:</strong> {tenant.email || 'No email on file'}</div>
              <div style={{ marginBottom: '0.5rem' }}><strong>Subject:</strong> {subject}</div>
              <div style={{ whiteSpace: 'pre-wrap', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                {body}
              </div>
            </div>
          )}
          
          {!template && templates.length === 0 && (
            <p className="muted">No templates found. Go to Settings to create email templates.</p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            onClick={handleSend}
            disabled={!template || !tenant.email}
          >
            Open in Email Client
          </button>
        </div>
      </div>
    </div>
  )
}
