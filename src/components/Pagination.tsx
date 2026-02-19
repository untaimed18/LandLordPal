import type { PaginationResult } from '../hooks/usePagination'

interface DirectProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pagination?: never
}

interface HookProps {
  pagination: PaginationResult<unknown>
  currentPage?: never
  totalPages?: never
  onPageChange?: never
}

type PaginationProps = DirectProps | HookProps

export default function Pagination(props: PaginationProps) {
  const currentPage = 'pagination' in props && props.pagination ? props.pagination.page : props.currentPage!
  const totalPages = 'pagination' in props && props.pagination ? props.pagination.totalPages : props.totalPages!
  const onPageChange = 'pagination' in props && props.pagination ? props.pagination.setPage : props.onPageChange!

  if (totalPages <= 1) return null

  const pages: (number | '...')[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} aria-label="Previous page">
        &lsaquo;
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: 'var(--text-muted)' }}>&hellip;</span>
        ) : (
          <button
            key={p}
            type="button"
            className={currentPage === p ? 'active' : ''}
            onClick={() => onPageChange(p)}
            aria-current={currentPage === p ? 'page' : undefined}
          >
            {p}
          </button>
        )
      )}
      <button type="button" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} aria-label="Next page">
        &rsaquo;
      </button>
    </nav>
  )
}
