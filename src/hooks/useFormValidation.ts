import { useState, useCallback } from 'react'
import type { z } from 'zod'
import type { ValidationErrors } from '../lib/schemas'
import { extractErrors } from '../lib/schemas'

export function useFormValidation<T>(schema: z.ZodType<T>) {
  const [errors, setErrors] = useState<ValidationErrors>({})

  const validate = useCallback((data: unknown): data is T => {
    const result = schema.safeParse(data)
    if (result.success) {
      setErrors({})
      return true
    }
    setErrors(extractErrors(result.error))
    return false
  }, [schema])

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const clearAll = useCallback(() => setErrors({}), [])

  return { errors, validate, clearError, clearAll }
}
