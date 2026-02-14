import { useState, useEffect, useCallback } from 'react'
import { Download, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react'

type Status = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'dismissed'

export default function UpdateNotification() {
  const [status, setStatus] = useState<Status>('idle')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onUpdateStatus) return

    const cleanup = api.onUpdateStatus((data) => {
      switch (data.event) {
        case 'checking':
          setStatus('checking')
          break
        case 'available':
          setStatus('available')
          setVersion(data.version ?? '')
          break
        case 'not-available':
          setStatus('idle')
          break
        case 'downloading':
          setStatus('downloading')
          setPercent(data.percent ?? 0)
          break
        case 'downloaded':
          setStatus('downloaded')
          setVersion(data.version ?? '')
          break
        case 'error':
          setErrorMsg(data.message ?? 'Update check failed')
          setStatus('error')
          // Auto-dismiss errors after 8 seconds
          setTimeout(() => setStatus((s) => (s === 'error' ? 'idle' : s)), 8000)
          break
      }
    })

    return cleanup
  }, [])

  const handleDownload = useCallback(() => {
    window.electronAPI?.startDownload()
  }, [])

  const handleInstall = useCallback(() => {
    window.electronAPI?.installUpdate()
  }, [])

  const handleDismiss = useCallback(() => {
    setStatus('dismissed')
  }, [])

  const handleRetry = useCallback(() => {
    setStatus('checking')
    window.electronAPI?.checkForUpdates()
  }, [])

  // Don't render anything if not in Electron or nothing to show
  if (!window.electronAPI?.onUpdateStatus) return null
  if (status === 'idle' || status === 'dismissed') return null

  return (
    <div className={`update-bar update-bar--${status}`}>
      {status === 'checking' && (
        <>
          <Loader2 size={16} className="update-spinner" />
          <span>Checking for updates...</span>
        </>
      )}

      {status === 'available' && (
        <>
          <Download size={16} />
          <span>Update available: <strong>v{version}</strong></span>
          <button type="button" className="update-btn primary" onClick={handleDownload}>
            Download now
          </button>
          <button type="button" className="update-btn" onClick={handleDismiss}>
            Later
          </button>
        </>
      )}

      {status === 'downloading' && (
        <>
          <Loader2 size={16} className="update-spinner" />
          <span>Downloading update... {percent}%</span>
          <div className="update-progress">
            <div className="update-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </>
      )}

      {status === 'downloaded' && (
        <>
          <CheckCircle size={16} />
          <span>Update <strong>v{version}</strong> ready!</span>
          <button type="button" className="update-btn primary" onClick={handleInstall}>
            Restart &amp; install
          </button>
          <button type="button" className="update-btn" onClick={handleDismiss}>
            Later
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <XCircle size={16} />
          <span className="update-error-text">{errorMsg}</span>
          <button type="button" className="update-btn" onClick={handleRetry}>
            <RefreshCw size={13} /> Retry
          </button>
          <button type="button" className="update-btn" onClick={handleDismiss}>
            Dismiss
          </button>
        </>
      )}
    </div>
  )
}
