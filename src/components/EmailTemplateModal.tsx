import { useState } from 'react'
import { Tenant, Property, Unit, EmailTemplate } from '../types'
import { addCommunicationLog } from '../store'
import { processTemplate } from '../lib/email'
import { formatMoney } from '../lib/format'
import { nowISO } from '../lib/id'
import { useToast } from '../context/ToastContext'
import { Mail, Send, User, FileText, AlertCircle, ChevronDown } from 'lucide-react'

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
      <div className="modal card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3><Mail size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Compose Email</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="email-recipient-banner">
            <div className="email-recipient-avatar"><User size={16} /></div>
            <div className="email-recipient-info">
              <span className="email-recipient-name">{tenant.name}</span>
              <span className="email-recipient-email">{tenant.email || 'No email on file'}</span>
            </div>
          </div>

          {!tenant.email && (
            <div className="email-warning">
              <AlertCircle size={14} />
              <span>This tenant has no email address. Add one on their detail page to send emails.</span>
            </div>
          )}

          <div className="email-template-select">
            <label className="email-field-label"><FileText size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Template</label>
            <div className="email-select-wrap">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                <option value="">Choose a template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="email-select-chevron" />
            </div>
          </div>

          {template ? (
            <div className="email-preview-card">
              <div className="email-preview-header">
                <div className="email-preview-field"><span className="email-preview-label">To</span><span>{tenant.email || '—'}</span></div>
                <div className="email-preview-field"><span className="email-preview-label">Subject</span><span>{subject}</span></div>
              </div>
              <div className="email-preview-body">{body}</div>
            </div>
          ) : templates.length === 0 ? (
            <div className="email-empty-state">
              <FileText size={28} strokeWidth={1.5} />
              <span>No templates yet</span>
              <span className="muted">Go to Settings to create email templates.</span>
            </div>
          ) : (
            <div className="email-empty-state">
              <Mail size={28} strokeWidth={1.5} />
              <span>Select a template above to preview</span>
            </div>
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
            <Send size={14} style={{ marginRight: 6, verticalAlign: '-1px' }} />
            Open in Email Client
          </button>
        </div>
      </div>
    </div>
  )
}
