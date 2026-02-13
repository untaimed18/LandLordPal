import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastMessage = { id: number; text: string; type: 'success' | 'error' | 'info' }

let nextToastId = 0

const ToastContext = createContext<((text: string, type?: 'success' | 'error' | 'info') => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const add = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = ++nextToastId
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])
  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.text}
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
