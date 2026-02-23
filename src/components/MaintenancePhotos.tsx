import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { Camera, X, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MaintenancePhoto } from '../types'
import { nowISO } from '../lib/id'

interface Props {
  photos: MaintenancePhoto[]
  onChange: (photos: MaintenancePhoto[]) => void
  readOnly?: boolean
}

export default function MaintenancePhotos({ photos, onChange, readOnly }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const [resolvedPaths, setResolvedPaths] = useState<Record<string, string>>({})
  const resolvedRef = useRef(resolvedPaths)
  resolvedRef.current = resolvedPaths
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      const api = window.electronAPI
      if (!api?.photoGetPath) return
      const cache = resolvedRef.current
      const paths: Record<string, string> = {}
      for (const photo of photos) {
        if (cache[photo.filename]) {
          paths[photo.filename] = cache[photo.filename]
          continue
        }
        const p = await api.photoGetPath(photo.filename)
        if (p && !cancelled) paths[photo.filename] = p
      }
      if (!cancelled) setResolvedPaths((prev) => ({ ...prev, ...paths }))
    }
    resolve()
    return () => { cancelled = true }
  }, [photos])

  const handleAdd = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.photoPick) return
    const result = await api.photoPick()
    if (!result) return
    const newPhoto: MaintenancePhoto = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filename: result.filename,
      date: nowISO(),
    }
    onChange([...photos, newPhoto])
    toast('Photo added')
  }, [photos, onChange, toast])

  async function handleDelete(photo: MaintenancePhoto) {
    const ok = await confirm({ title: 'Delete photo', message: 'Remove this photo?', confirmText: 'Delete', danger: true })
    if (!ok) return
    const api = window.electronAPI
    if (api?.photoDelete) await api.photoDelete(photo.filename)
    onChange(photos.filter((p) => p.id !== photo.id))
    toast('Photo removed')
  }

  function handleLabelToggle(photo: MaintenancePhoto) {
    const labels: (MaintenancePhoto['label'] | undefined)[] = [undefined, 'before', 'after']
    const currentIdx = labels.indexOf(photo.label)
    const nextLabel = labels[(currentIdx + 1) % labels.length]
    onChange(photos.map((p) => p.id === photo.id ? { ...p, label: nextLabel } : p))
  }

  function handleCaptionChange(photoId: string, caption: string) {
    onChange(photos.map((p) => p.id === photoId ? { ...p, caption } : p))
  }

  const getPhotoSrc = (filename: string) => {
    const p = resolvedPaths[filename]
    return p ? `file://${p.replace(/\\/g, '/')}` : ''
  }

  return (
    <div className="maint-photos">
      <div className="maint-photos-grid">
        {photos.map((photo, idx) => {
          const src = getPhotoSrc(photo.filename)
          return (
            <div key={photo.id} className="maint-photo-card">
              <div className="maint-photo-thumb" onClick={() => src && setLightboxIndex(idx)}>
                {src ? <img src={src} alt={photo.caption || 'Maintenance photo'} /> : <div className="maint-photo-placeholder">Loading...</div>}
                {photo.label && <span className={`maint-photo-label maint-photo-label-${photo.label}`}>{photo.label}</span>}
                <button type="button" className="maint-photo-expand" title="View full size"><Maximize2 size={14} /></button>
              </div>
              {!readOnly && (
                <div className="maint-photo-meta">
                  <input
                    className="maint-photo-caption"
                    placeholder="Add caption..."
                    value={photo.caption || ''}
                    onChange={(e) => handleCaptionChange(photo.id, e.target.value)}
                  />
                  <div className="maint-photo-actions">
                    <button type="button" className="btn small" onClick={() => handleLabelToggle(photo)} title="Toggle before/after label">
                      {photo.label ?? 'Label'}
                    </button>
                    <button type="button" className="btn small danger" onClick={() => handleDelete(photo)} title="Delete photo">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {!readOnly && (
          <button type="button" className="maint-photo-add" onClick={handleAdd}>
            <Camera size={24} />
            <span>Add photo</span>
          </button>
        )}
      </div>

      {lightboxIndex !== null && (() => {
        const photo = photos[lightboxIndex]
        if (!photo) return null
        const src = getPhotoSrc(photo.filename)
        return (
          <div className="maint-lightbox" onClick={() => setLightboxIndex(null)}>
            <div className="maint-lightbox-inner" onClick={(e) => e.stopPropagation()}>
              <img src={src} alt={photo.caption || 'Photo'} />
              {photo.caption && <p className="maint-lightbox-caption">{photo.caption}</p>}
              {photo.label && <span className={`maint-photo-label maint-photo-label-${photo.label}`}>{photo.label}</span>}
              <button type="button" className="maint-lightbox-close" onClick={() => setLightboxIndex(null)}><X size={20} /></button>
              {photos.length > 1 && (
                <>
                  <button type="button" className="maint-lightbox-nav maint-lightbox-prev" onClick={() => setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length)}><ChevronLeft size={24} /></button>
                  <button type="button" className="maint-lightbox-nav maint-lightbox-next" onClick={() => setLightboxIndex((lightboxIndex + 1) % photos.length)}><ChevronRight size={24} /></button>
                </>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
