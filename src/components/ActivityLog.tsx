import { useState } from 'react'
import type { ActivityLog as ActivityLogType, Property, Unit, Tenant } from '../types'
import { deleteActivityLog } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatDate } from '../lib/format'
import Pagination from './Pagination'

const PAGE_SIZE = 15

interface Props {
  property: Property
  units: Unit[]
  tenants: Tenant[]
  activityLogs: ActivityLogType[]
  onAddNote: () => void
}

export default function ActivityLogSection({ property, units, tenants, activityLogs, onAddNote }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(activityLogs.length / PAGE_SIZE))
  const paginated = activityLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (activityLogs.length === 0) {
    return (
      <section className="card section-card" aria-label="Activity log">
        <div className="section-card-header">
          <h2>Activity log</h2>
          <button type="button" className="btn small" onClick={onAddNote}>Add note</button>
        </div>
        <p className="empty-state">No notes yet. Add notes to track interactions, inspections, and other events.</p>
      </section>
    )
  }

  return (
    <section className="card section-card" aria-label="Activity log">
      <div className="section-card-header">
        <h2>Activity log ({activityLogs.length})</h2>
        <button type="button" className="btn small" onClick={onAddNote}>Add note</button>
      </div>
      <div className="activity-timeline">
        {paginated.map((log) => {
          let entityLabel = ''
          if (log.entityType === 'property') entityLabel = property.name
          else if (log.entityType === 'unit') entityLabel = units.find((u) => u.id === log.entityId)?.name ?? 'Unit'
          else entityLabel = tenants.find((t) => t.id === log.entityId)?.name ?? 'Tenant'
          return (
            <div key={log.id} className="activity-item">
              <span className="activity-date">{formatDate(log.date)}</span>
              <span className="activity-entity badge">{log.entityType}: {entityLabel}</span>
              <span className="activity-note">{log.note}</span>
              <button
                type="button"
                className="btn-icon small"
                onClick={async () => {
                  if (await confirm({ title: 'Delete note', message: 'Delete this note?', confirmText: 'Delete', danger: true })) {
                    deleteActivityLog(log.id)
                    toast('Note deleted')
                  }
                }}
                aria-label="Delete note"
              >×</button>
            </div>
          )
        })}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </section>
  )
}
