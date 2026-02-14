import { useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { formatMoney } from '../lib/format'
import { toCSV, downloadCSV } from '../lib/csv'
import { useToast } from '../context/ToastContext'
import type { ExpenseCategory } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'management', label: 'Management' },
  { value: 'legal', label: 'Legal' },
  { value: 'other', label: 'Other' },
]

type ReportType = 'pnl' | 'expenses' | 'tax' | 'cashflow'

export default function Reports() {
  const { properties, expenses, payments } = useStore()
  const toast = useToast()
  const printRef = useRef<HTMLDivElement>(null)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [propertyFilter, setPropertyFilter] = useState('')
  const [activeReport, setActiveReport] = useState<ReportType>('pnl')
  // Build year options dynamically from actual data range (at least ±1 from current year)
  const yearOptions = useMemo(() => {
    const allDates = [
      ...payments.map((p) => p.date),
      ...expenses.map((e) => e.date),
    ].filter(Boolean)
    let minYear = now.getFullYear() - 1
    let maxYear = now.getFullYear() + 1
    for (const d of allDates) {
      const y = Number(d.slice(0, 4))
      if (Number.isFinite(y)) {
        if (y < minYear) minYear = y
        if (y > maxYear) maxYear = y
      }
    }
    return Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i)
  }, [payments, expenses])

  const filteredPayments = propertyFilter ? payments.filter((p) => p.propertyId === propertyFilter) : payments
  const filteredExpenses = propertyFilter ? expenses.filter((e) => e.propertyId === propertyFilter) : expenses

  // Monthly income/expenses
  const monthly = useMemo(() => {
    return Array.from({ length: 12 }, (_, month) => {
      const monthPayments = filteredPayments.filter((p) => {
        const d = new Date(p.date + 'T12:00:00')
        return d.getFullYear() === year && d.getMonth() === month
      })
      const monthExpenses = filteredExpenses.filter((e) => {
        const d = new Date(e.date + 'T12:00:00')
        return d.getFullYear() === year && d.getMonth() === month
      })
      const income = monthPayments.reduce((s, p) => s + p.amount, 0)
      const exp = monthExpenses.reduce((s, e) => s + e.amount, 0)
      return { month, income, expenses: exp, net: income - exp }
    })
  }, [filteredPayments, filteredExpenses, year])

  // Expense breakdown by category
  const expenseByCategory = useMemo(() => {
    const yearExpenses = filteredExpenses.filter((e) => {
      const d = new Date(e.date + 'T12:00:00')
      return d.getFullYear() === year
    })
    const cats: Record<string, number> = {}
    yearExpenses.forEach((e) => {
      cats[e.category] = (cats[e.category] ?? 0) + e.amount
    })
    return CATEGORIES.map((c) => ({
      category: c.label,
      value: c.value,
      amount: cats[c.value] ?? 0,
    })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount)
  }, [filteredExpenses, year])

  // Tax summary (Schedule E-like)
  const taxSummary = useMemo(() => {
    const yearPayments = filteredPayments.filter((p) => new Date(p.date + 'T12:00:00').getFullYear() === year)
    const yearExpenses = filteredExpenses.filter((e) => new Date(e.date + 'T12:00:00').getFullYear() === year)
    const totalIncome = yearPayments.reduce((s, p) => s + p.amount, 0)
    const byCategory: Record<string, number> = {}
    yearExpenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount })
    const totalExpenses = yearExpenses.reduce((s, e) => s + e.amount, 0)
    return { totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses, byCategory }
  }, [filteredPayments, filteredExpenses, year])

  // Cash flow chart data - find the max value for scaling
  const maxCashFlow = useMemo(() => {
    return Math.max(1, ...monthly.map((m) => Math.max(m.income, m.expenses, Math.abs(m.net))))
  }, [monthly])

  const totalIncome = monthly.reduce((s, m) => s + m.income, 0)
  const totalExp = monthly.reduce((s, m) => s + m.expenses, 0)
  const totalCatExpense = expenseByCategory.reduce((s, c) => s + c.amount, 0)

  function exportPnL() {
    const csv = toCSV(
      ['Month', 'Income', 'Expenses', 'Net'],
      monthly.map((m) => [MONTHS[m.month], m.income, m.expenses, m.net])
    )
    downloadCSV(`pnl-${year}${propertyFilter ? '-' + propertyFilter : ''}.csv`, csv)
  }

  function exportTax() {
    const rows: (string | number)[][] = [
      ['Gross Rental Income', taxSummary.totalIncome],
      ['', ''],
      ['Expenses:', ''],
    ]
    CATEGORIES.forEach((c) => {
      const amt = taxSummary.byCategory[c.value] ?? 0
      if (amt > 0) rows.push([`  ${c.label}`, amt])
    })
    rows.push(['', ''])
    rows.push(['Total Expenses', taxSummary.totalExpenses])
    rows.push(['Net Rental Income', taxSummary.netIncome])
    const csv = toCSV(['Item', 'Amount'], rows)
    downloadCSV(`tax-summary-${year}.csv`, csv)
  }

  function handlePrintReport() {
    window.print()
    toast('Print dialog opened — save as PDF to export', 'info')
  }

  const hasData = payments.length > 0 || expenses.length > 0

  return (
    <div className="page reports-page">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="page-desc">Financial reports and analysis for your properties.</p>
        </div>
        {hasData && (
          <div className="header-actions">
            <button type="button" className="btn" onClick={handlePrintReport}>
              Print / Save PDF
            </button>
          </div>
        )}
      </div>

      {!hasData && (
        <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
          <div className="empty-icon">📊</div>
          <p className="empty-state-title">No financial data yet</p>
          <p className="empty-state-text">Reports will appear once you start recording rent payments and expenses. Add a property and start tracking to see your Profit & Loss, tax summaries, and cash flow trends.</p>
          <Link to="/properties" className="btn primary">Get started</Link>
        </div>
      )}

      {hasData && <div ref={printRef} className="print-report-area">
      <div className="filter-bar no-print" style={{ marginBottom: '1.5rem' }}>
        <label>
          <span className="label-text">Year</span>
          <select className="select-inline" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>
          <span className="label-text">Property</span>
          <select className="select-inline" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
            <option value="">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <div className="report-tabs">
        {([
          { key: 'pnl' as const, label: 'Profit & Loss' },
          { key: 'expenses' as const, label: 'Expense Breakdown' },
          { key: 'tax' as const, label: 'Tax Summary' },
          { key: 'cashflow' as const, label: 'Cash Flow' },
        ]).map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`report-tab ${activeReport === tab.key ? 'active' : ''}`}
            onClick={() => setActiveReport(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeReport === 'pnl' && (
        <section className="card section-card">
          <div className="section-card-header">
            <h2>Profit & Loss — {year}</h2>
            <button type="button" className="btn small" onClick={exportPnL}>Export CSV</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{MONTHS[m.month]}</td>
                    <td className="positive">{formatMoney(m.income)}</td>
                    <td className="negative">{formatMoney(m.expenses)}</td>
                    <td className={m.net >= 0 ? 'positive' : 'negative'}>{formatMoney(m.net)}</td>
                  </tr>
                ))}
                <tr className="table-total-row">
                  <td><strong>Total</strong></td>
                  <td className="positive"><strong>{formatMoney(totalIncome)}</strong></td>
                  <td className="negative"><strong>{formatMoney(totalExp)}</strong></td>
                  <td className={totalIncome - totalExp >= 0 ? 'positive' : 'negative'}><strong>{formatMoney(totalIncome - totalExp)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeReport === 'expenses' && (
        <section className="card section-card">
          <h2>Expense Breakdown — {year}</h2>
          {expenseByCategory.length === 0 ? (
            <p className="empty-state">No expenses recorded for {year}.</p>
          ) : (
            <>
              <div className="expense-bars">
                {expenseByCategory.map((c) => (
                  <div key={c.value} className="expense-bar-row">
                    <span className="expense-bar-label">{c.category}</span>
                    <div className="expense-bar-track">
                      <div className="expense-bar-fill" style={{ width: `${(c.amount / totalCatExpense) * 100}%` }} />
                    </div>
                    <span className="expense-bar-amount">{formatMoney(c.amount)}</span>
                    <span className="expense-bar-pct muted">{((c.amount / totalCatExpense) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ marginTop: '1rem' }}>Total: {formatMoney(totalCatExpense)}</p>
            </>
          )}
        </section>
      )}

      {activeReport === 'tax' && (
        <section className="card section-card">
          <div className="section-card-header">
            <h2>Tax Summary — {year}</h2>
            <button type="button" className="btn small" onClick={exportTax}>Export CSV</button>
          </div>
          <div className="tax-summary-report">
            <div className="tax-row header-row">
              <span>Gross Rental Income</span>
              <span className="positive">{formatMoney(taxSummary.totalIncome)}</span>
            </div>
            <div className="tax-section-label">Expenses</div>
            {CATEGORIES.map((c) => {
              const amt = taxSummary.byCategory[c.value] ?? 0
              if (amt === 0) return null
              return (
                <div key={c.value} className="tax-row indent">
                  <span>{c.label}</span>
                  <span>{formatMoney(amt)}</span>
                </div>
              )
            })}
            <div className="tax-row total-row">
              <span>Total Expenses</span>
              <span className="negative">{formatMoney(taxSummary.totalExpenses)}</span>
            </div>
            <div className="tax-row net-row">
              <span><strong>Net Rental Income</strong></span>
              <span className={taxSummary.netIncome >= 0 ? 'positive' : 'negative'}><strong>{formatMoney(taxSummary.netIncome)}</strong></span>
            </div>
          </div>
        </section>
      )}

      {activeReport === 'cashflow' && (
        <section className="card section-card">
          <h2>Cash Flow Trend — {year}</h2>
          <div className="cashflow-chart">
            {monthly.map((m) => (
              <div key={m.month} className="cashflow-bar-group">
                <div className="cashflow-bars">
                  <div
                    className="cashflow-bar income"
                    style={{ height: `${(m.income / maxCashFlow) * 120}px` }}
                    title={`Income: ${formatMoney(m.income)}`}
                  />
                  <div
                    className="cashflow-bar expense"
                    style={{ height: `${(m.expenses / maxCashFlow) * 120}px` }}
                    title={`Expenses: ${formatMoney(m.expenses)}`}
                  />
                </div>
                <span className="cashflow-label">{MONTHS[m.month]}</span>
                <span className={`cashflow-net ${m.net >= 0 ? 'positive' : 'negative'}`}>
                  {m.net >= 0 ? '+' : ''}{formatMoney(m.net)}
                </span>
              </div>
            ))}
          </div>
          <div className="cashflow-legend">
            <span><span className="legend-dot income" /> Income</span>
            <span><span className="legend-dot expense" /> Expenses</span>
          </div>
        </section>
      )}
      </div>}
    </div>
  )
}
