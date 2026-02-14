import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastMessage {
  id: number
  text: string
  type: ToastType
  action?: ToastAction
}

let nextToastId = 0

type ToastFn = (text: string, typeOrAction?: ToastType | { type?: ToastType; action?: ToastAction }) => void

const ToastContext = createContext<ToastFn | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const add = useCallback<ToastFn>((text, typeOrAction) => {
    const id = ++nextToastId
    let type: ToastType = 'success'
    let action: ToastAction | undefined

    if (typeof typeOrAction === 'string') {
      type = typeOrAction
    } else if (typeOrAction && typeof typeOrAction === 'object') {
      type = typeOrAction.type ?? 'success'
      action = typeOrAction.action
    }

    setToasts((prev) => [...prev, { id, text, type, action }])
    const duration = action ? 6000 : 3000
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-text">{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => { t.action!.onClick(); dismiss(t.id) }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  return ctx ?? (() => {})
}
