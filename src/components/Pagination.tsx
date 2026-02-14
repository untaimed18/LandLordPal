import type { PaginationResult } from '../hooks/usePagination'

interface Props<T> {
  pagination: PaginationResult<T>
}

export default function Pagination<T>({ pagination: p }: Props<T>) {
  if (p.total <= p.pageSize && p.totalPages <= 1) return null

  const pages: (number | '...')[] = []
  for (let i = 1; i <= p.totalPages; i++) {
    if (i === 1 || i === p.totalPages || Math.abs(i - p.page) <= 1) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <div className="pagination">
      <span className="pagination-info">
        {p.startIndex}–{p.endIndex} of {p.total}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn-sm"
          disabled={p.page <= 1}
          onClick={() => p.setPage(p.page - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>
        {pages.map((pg, i) =>
          pg === '...' ? (
            <span key={`e${i}`} className="pagination-ellipsis">…</span>
          ) : (
            <button
              key={pg}
              type="button"
              className={`btn-sm ${pg === p.page ? 'active' : ''}`}
              onClick={() => p.setPage(pg)}
            >
              {pg}
            </button>
          )
        )}
        <button
          type="button"
          className="btn-sm"
          disabled={p.page >= p.totalPages}
          onClick={() => p.setPage(p.page + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
      <select
        className="pagination-size"
        value={p.pageSize}
        onChange={(e) => p.setPageSize(Number(e.target.value))}
        aria-label="Page size"
      >
        <option value={10}>10 / page</option>
        <option value={25}>25 / page</option>
        <option value={50}>50 / page</option>
        <option value={100}>100 / page</option>
      </select>
    </div>
  )
}
