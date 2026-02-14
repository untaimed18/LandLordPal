import { useMemo, useState } from 'react'

export interface PaginationResult<T> {
  page: number
  setPage: (p: number) => void
  pageSize: number
  setPageSize: (s: number) => void
  totalPages: number
  paged: T[]
  startIndex: number
  endIndex: number
  total: number
}

export function usePagination<T>(items: T[], defaultSize = 25): PaginationResult<T> {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultSize)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  // Clamp page
  const safePage = Math.min(page, totalPages)
  if (safePage !== page) {
    // Reset in next tick to avoid render-loop
    Promise.resolve().then(() => setPage(safePage))
  }

  const paged = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  )

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize: (s: number) => { setPageSize(s); setPage(1) },
    totalPages,
    paged,
    startIndex: (safePage - 1) * pageSize + 1,
    endIndex: Math.min(safePage * pageSize, items.length),
    total: items.length,
  }
}
