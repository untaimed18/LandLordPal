import { useState } from 'react'
import type { Tenant, CommunicationLog as CommLog, CommunicationType } from '../types'
import { addCommunicationLog, deleteCommunicationLog } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { nowISO } from '../lib/id'
import { formatDate } from '../lib/format'
import Pagination from './Pagination'

const PAGE_SIZE = 15

const COMM_TYPES: { value: CommunicationType; label: string }[] = [
  { value: 'call', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'text', label: 'Text Message' },
  { value: 'in_person', label: 'In Person' },
  { value: 'letter', label: 'Letter' },
  { value: 'other', label: 'Other' },
]

interface Props {
  propertyId: string
  tenants: Tenant[]
  communicationLogs: CommLog[]
}

export default function CommunicationLogSection({ propertyId, tenants, communicationLogs }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const [commForm, setCommForm] = useState(false)
  const [newComm, setNewComm] = useState({ type: 'call' as CommunicationType, date: nowISO(), subject: '', notes: '' })

  const [page, setPage] = useState(1)

  const propComms = communicationLogs
    .filter((c) => c.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date))

  const totalPages = Math.max(1, Math.ceil(propComms.length / PAGE_SIZE))
  const paginated = propComms.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <section className="card section-card" aria-label="Communication log">
      <div className="section-card-header">
        <h2>Communication log</h2>
        {tenants.length > 0 && (
          <button type="button" className="btn small primary" onClick={() => { setCommForm(!commForm); setNewComm({ type: 'call', date: nowISO(), subject: '', notes: '' }) }}>
            {commForm ? 'Cancel' : '+ Log communication'}
          </button>
        )}
      </div>
      {commForm && (
        <form className="form-card" style={{ marginBottom: '1rem' }} onSubmit={async (e) => {
          e.preventDefault()
          const tenantId = (e.currentTarget.querySelector('[name="comm-tenant"]') as HTMLSelectElement)?.value
          if (!tenantId || !newComm.subject.trim()) return
          const t = tenants.find((x) => x.id === tenantId)
          try {
            await addCommunicationLog({
              tenantId,
              propertyId,
              type: newComm.type,
              date: newComm.date,
              subject: newComm.subject,
              notes: newComm.notes || undefined,
            })
            setCommForm(false)
            toast(`Communication with ${t?.name ?? 'tenant'} logged`)
          } catch {
            toast('Failed to log communication', 'error')
          }
        }}>
          <div className="form-grid">
            <label>Tenant * <select name="comm-tenant" required aria-label="Select tenant">
              <option value="">Select tenant</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
            <label>Type <select value={newComm.type} onChange={(e) => setNewComm((c) => ({ ...c, type: e.target.value as CommunicationType }))} aria-label="Communication type">
              {COMM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select></label>
            <label>Date * <input type="date" required value={newComm.date} onChange={(e) => setNewComm((c) => ({ ...c, date: e.target.value }))} /></label>
          </div>
          <label>Subject * <input required value={newComm.subject} onChange={(e) => setNewComm((c) => ({ ...c, subject: e.target.value }))} placeholder="e.g. Discussed lease renewal" /></label>
          <label style={{ marginTop: '0.5rem' }}>Notes <textarea rows={2} value={newComm.notes} onChange={(e) => setNewComm((c) => ({ ...c, notes: e.target.value }))} placeholder="Details of the conversation..." /></label>
          <div className="form-actions"><button type="submit" className="btn primary">Save</button></div>
        </form>
      )}
      {propComms.length === 0 ? (
        <p className="empty-state">No communications logged yet.{tenants.length === 0 ? ' Add a tenant first.' : ''}</p>
      ) : (
        <>
          <div className="activity-timeline">
            {paginated.map((c) => {
              const t = tenants.find((x) => x.id === c.tenantId)
              return (
                <div key={c.id} className="activity-item">
                  <span className="activity-date">{formatDate(c.date)}</span>
                  <span className="badge small">{COMM_TYPES.find((ct) => ct.value === c.type)?.label ?? c.type}</span>
                  <strong>{t?.name ?? 'Unknown'}</strong>
                  <span className="activity-note">{c.subject}{c.notes ? ` — ${c.notes}` : ''}</span>
                  <button type="button" className="btn-icon small" onClick={async () => { if (await confirm({ title: 'Delete communication', message: 'Delete this entry?', confirmText: 'Delete', danger: true })) { deleteCommunicationLog(c.id); toast('Entry deleted') } }} aria-label="Delete communication entry">×</button>
                </div>
              )
            })}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </section>
  )
}
