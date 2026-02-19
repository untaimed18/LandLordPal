import { useState, useEffect, useRef } from 'react'
import { Check } from 'lucide-react'

export default function SaveIndicator() {
  const [visible, setVisible] = useState(false)
  const [isError, setIsError] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    function handleSaveSuccess() {
      setIsError(false)
      setVisible(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), 1500)
    }

    function handleSaveError() {
      setIsError(true)
      setVisible(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), 4000)
    }

    window.addEventListener('landlordpal:save-success', handleSaveSuccess)
    window.addEventListener('landlordpal:save-error', handleSaveError)
    return () => {
      window.removeEventListener('landlordpal:save-success', handleSaveSuccess)
      window.removeEventListener('landlordpal:save-error', handleSaveError)
      clearTimeout(timerRef.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div className={`save-indicator ${isError ? 'save-indicator-error' : 'save-indicator-success'}`} role="status" aria-live="polite">
      {isError ? (
        <span>Save failed</span>
      ) : (
        <>
          <Check size={14} aria-hidden="true" />
          <span>Saved</span>
        </>
      )}
    </div>
  )
}
