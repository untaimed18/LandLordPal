import { useStore } from '../hooks/useStore'
import { addDocument, deleteDocument, openDocument } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { Paperclip, Upload, Trash2, ExternalLink } from 'lucide-react'
import type { Document } from '../types'

interface Props {
  entityType: Document['entityType']
  entityId: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentAttachments({ entityType, entityId }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const { documents } = useStore()

  const entityDocs = documents.filter(
    (d) => d.entityType === entityType && d.entityId === entityId
  )

  async function handleAdd() {
    const doc = await addDocument(entityType, entityId)
    if (doc) toast('Document attached')
  }

  async function handleDelete(doc: Document) {
    const ok = await confirm({
      title: 'Remove attachment',
      message: `Remove "${doc.originalName}"? The file will be deleted.`,
      confirmText: 'Remove',
      danger: true,
    })
    if (ok) {
      deleteDocument(doc.id)
      toast('Document removed')
    }
  }

  return (
    <div className="documents-section">
      <div className="section-card-header" style={{ marginBottom: '0.5rem' }}>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: '0.9rem' }}>
          <Paperclip size={15} aria-hidden="true" /> Documents ({entityDocs.length})
        </h4>
        <button type="button" className="doc-upload-btn" onClick={handleAdd}>
          <Upload size={14} aria-hidden="true" /> Attach file
        </button>
      </div>
      {entityDocs.length > 0 && (
        <div className="doc-list">
          {entityDocs.map((doc) => (
            <div key={doc.id} className="doc-item">
              <Paperclip size={14} className="muted" aria-hidden="true" />
              <span className="doc-item-name" title={doc.originalName}>{doc.originalName}</span>
              <span className="doc-item-size">{formatFileSize(doc.size)}</span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => openDocument(doc.id)}
                aria-label={`Open ${doc.originalName}`}
                title="Open file"
              >
                <ExternalLink size={14} />
              </button>
              <button
                type="button"
                className="btn-icon danger"
                onClick={() => handleDelete(doc)}
                aria-label={`Remove ${doc.originalName}`}
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
