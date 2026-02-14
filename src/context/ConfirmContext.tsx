import { createContext, useContext, useState, useCallback, useEffect } from 'react'

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false))

export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve })
    })
  }, [])

  const handleConfirm = () => {
    state?.resolve(true)
    setState(null)
  }

  const handleCancel = () => {
    state?.resolve(false)
    setState(null)
  }

  useEffect(() => {
    if (!state) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-overlay confirm-overlay" onClick={handleCancel}>
          <div className="modal card confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{state.title || 'Confirm'}</h3>
              <button type="button" className="btn-icon" onClick={handleCancel} aria-label="Close">×</button>
            </div>
            <p className="confirm-message">{state.message}</p>
            <div className="form-actions">
              <button
                type="button"
                className={`btn ${state.danger ? 'danger' : 'primary'}`}
                onClick={handleConfirm}
                autoFocus
              >
                {state.confirmText || 'Confirm'}
              </button>
              <button type="button" className="btn" onClick={handleCancel}>
                {state.cancelText || 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
