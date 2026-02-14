import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { addExpense, updateExpense, deleteExpense, takeSnapshot, restoreSnapshot } from '../store'
import { getExpensesThisMonth, getYTDExpenses } from '../lib/calculations'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatMoney, formatDate } from '../lib/format'
import type { ExpenseCategory } from '../types'
import { nowISO } from '../lib/id'
import { usePagination } from '../hooks/usePagination'
import Pagination from '../components/Pagination'
import { Receipt } from 'lucide-react'
import { toCSV, downloadCSV } from '../lib/csv'

function formatAmountDisplay(value: number): string {
  if (!value) return ''
  const parts = value.toFixed(2).split('.')
  const intPart = Number(parts[0]).toLocaleString('en-US')
  const decPart = parts[1]
  return decPart === '00' ? intPart : `${intPart}.${decPart}`
}

function parseAmountInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  // Allow only one decimal point
  const dotIdx = cleaned.indexOf('.')
  const sanitized = dotIdx === -1 ? cleaned : cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, '')
  // Limit to 2 decimal places
  const [intPart, decPart] = sanitized.split('.')
  const final = decPart !== undefined ? `${intPart}.${decPart.slice(0, 2)}` : intPart
  return final ? Number(final) : 0
}

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

export default function Expenses() {
  const toast = useToast()
  const confirm = useConfirm()
  const { properties, units, expenses } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    propertyId: '',
    unitId: '',
    category: 'other' as ExpenseCategory,
    amount: 0,
    date: nowISO(),
    description: '',
    recurring: false,
  })

  const now = new Date()
  const thisMonth = getExpensesThisMonth(expenses, now.getFullYear(), now.getMonth())
  const ytd = getYTDExpenses(expenses, now.getFullYear())

  const [filterProperty, setFilterProperty] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortCol, setSortCol] = useState<'date' | 'property' | 'category' | 'description' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'amount' ? 'desc' : 'asc') }
  }
  function sortIndicator(col: typeof sortCol) {
    return sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
  }

  const filteredExpenses = expenses.filter((ex) => {
    if (filterProperty && ex.propertyId !== filterProperty) return false
    if (filterCategory && ex.category !== filterCategory) return false
    return true
  })
  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    switch (sortCol) {
      case 'date': return dir * a.date.localeCompare(b.date)
      case 'property': return dir * ((properties.find((p) => p.id === a.propertyId)?.name ?? '').localeCompare(properties.find((p) => p.id === b.propertyId)?.name ?? ''))
      case 'category': return dir * a.category.localeCompare(b.category)
      case 'description': return dir * a.description.localeCompare(b.description)
      case 'amount': return dir * (a.amount - b.amount)
      default: return 0
    }
  })
  const pagination = usePagination(sortedExpenses)

  // Auto-generate recurring expenses for all missed months up to the current month
  // (guard against StrictMode double-fire)
  const recurringRan = useRef(false)
  useEffect(() => {
    if (recurringRan.current) return
    recurringRan.current = true
    const recurring = expenses.filter((e) => e.recurring)
    if (recurring.length === 0) return
    const currentYear = now.getFullYear()
    const currentMonthIdx = now.getMonth()
    const currentMonth = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`
    let generatedCount = 0
    // Build a set of existing expense signatures to avoid duplicates quickly
    const existingKeys = new Set(
      expenses.map((e) => `${e.propertyId}|${e.category}|${e.description}|${e.date.slice(0, 7)}`)
    )
    for (const re of recurring) {
      const reYear = Number(re.date.slice(0, 4))
      const reMonthIdx = Number(re.date.slice(5, 7)) - 1
      // Walk forward from the month AFTER the source, up to and including the current month
      let y = reYear
      let m = reMonthIdx + 1
      if (m > 11) { m = 0; y++ }
      while (y < currentYear || (y === currentYear && m <= currentMonthIdx)) {
        const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`
        if (monthKey > currentMonth) break
        const sigKey = `${re.propertyId}|${re.category}|${re.description}|${monthKey}`
        if (!existingKeys.has(sigKey)) {
          addExpense({
            propertyId: re.propertyId,
            unitId: re.unitId,
            category: re.category,
            amount: re.amount,
            date: `${monthKey}-01`,
            description: re.description,
            recurring: true,
            vendorId: re.vendorId,
          })
          existingKeys.add(sigKey)
          generatedCount++
        }
        m++
        if (m > 11) { m = 0; y++ }
      }
    }
    if (generatedCount > 0) {
      toast(`Auto-generated ${generatedCount} recurring expense${generatedCount > 1 ? 's' : ''} for missed months`, 'info')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const propUnitsForForm = form.propertyId ? units.filter((u) => u.propertyId === form.propertyId) : []

  function openEdit(ex: (typeof expenses)[0]) {
    setEditingId(ex.id)
    setForm({
      propertyId: ex.propertyId,
      unitId: ex.unitId ?? '',
      category: ex.category,
      amount: ex.amount,
      date: ex.date,
      description: ex.description,
      recurring: ex.recurring ?? false,
    })
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.propertyId) return
    const data = {
      propertyId: form.propertyId,
      unitId: form.unitId || undefined,
      category: form.category,
      amount: form.amount,
      date: form.date,
      description: form.description || form.category,
      recurring: form.recurring,
    }
    if (editingId) {
      updateExpense(editingId, data)
      setEditingId(null)
      toast('Expense updated')
    } else {
      addExpense(data)
      toast('Expense added')
    }
    setForm({
      propertyId: form.propertyId,
      unitId: '',
      category: 'other',
      amount: 0,
      date: nowISO(),
      description: '',
      recurring: false,
    })
    setShowForm(false)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Expenses</h1>
          <p className="page-desc">Track mortgage, repairs, and other costs by property.</p>
        </div>
        <div className="header-actions">
          {expenses.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const csv = toCSV(
                  ['Date', 'Property', 'Unit', 'Category', 'Description', 'Amount', 'Recurring'],
                  sortedExpenses.map((ex) => [
                    ex.date,
                    properties.find((p) => p.id === ex.propertyId)?.name ?? '',
                    ex.unitId ? units.find((u) => u.id === ex.unitId)?.name ?? '' : '',
                    CATEGORIES.find((c) => c.value === ex.category)?.label ?? ex.category,
                    ex.description,
                    ex.amount,
                    ex.recurring ? 'Yes' : 'No',
                  ])
                )
                downloadCSV(`expenses-${nowISO()}.csv`, csv)
                toast('Expenses exported', 'info')
              }}
            >
              Export CSV
            </button>
          )}
          {properties.length > 0 && (
            <button type="button" className="btn primary" onClick={() => { setEditingId(null); setForm({ ...form, propertyId: form.propertyId, unitId: '', category: 'other', amount: 0, date: nowISO(), description: '', recurring: false }); setShowForm(!showForm) }}>
              {showForm ? 'Cancel' : '+ Add expense'}
            </button>
          )}
        </div>
      </div>

      {properties.length === 0 && (
        <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
          <div className="empty-icon"><Receipt size={32} /></div>
          <p className="empty-state-title">No expenses yet</p>
          <p className="empty-state-text">Add a property first, then start tracking mortgage, repairs, and other costs.</p>
          <Link to="/properties" className="btn primary">Add a property</Link>
        </div>
      )}

      {properties.length > 0 && (
        <div className="stats-grid two" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <span className="stat-label">Expenses this month</span>
            <span className="stat-value negative">{formatMoney(thisMonth)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">YTD expenses</span>
            <span className="stat-value negative">{formatMoney(ytd)}</span>
          </div>
        </div>
      )}

      {showForm && properties.length > 0 && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit expense' : 'New expense'}</h3>
          <div className="form-grid">
            <label>
              Property *
              <select
                required
                value={form.propertyId}
                onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value, unitId: '' }))}
              >
                <option value="">Select property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            {propUnitsForForm.length > 0 && (
              <label>
                Unit
                <select value={form.unitId} onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}>
                  <option value="">Property-wide</option>
                  {propUnitsForForm.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
            )}
            <label>
              Category *
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label>Amount * <input type="text" inputMode="decimal" required value={form.amount ? formatAmountDisplay(form.amount) : ''} onChange={(e) => setForm((f) => ({ ...f, amount: parseAmountInput(e.target.value) }))} placeholder="1,200.00" /></label>
            <label>Date * <input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></label>
          </div>
          <label>
            Description *
            <input
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Plumbing repair"
            />
          </label>
          <label className="checkbox-label" style={{ marginTop: '0.75rem' }}>
            <input type="checkbox" checked={form.recurring} onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))} />
            Recurring (auto-generate monthly)
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary">{editingId ? 'Save changes' : 'Save expense'}</button>
          </div>
        </form>
      )}

      {expenses.length > 0 && (
        <div className="filter-bar">
          <label>
            <span className="label-text">Property</span>
            <select className="select-inline" value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)}>
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            <span className="label-text">Category</span>
            <select className="select-inline" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          {(filterProperty || filterCategory) && (
            <button type="button" className="btn small" onClick={() => { setFilterProperty(''); setFilterCategory('') }}>Clear filters</button>
          )}
        </div>
      )}

      <div className="table-wrap">
        {expenses.length === 0 && properties.length > 0 ? (
          <div className="empty-state-card card" style={{ maxWidth: 400, margin: '1rem auto' }}>
            <p className="empty-state-title">No expenses yet</p>
            <p className="empty-state-text">Click "+ Add expense" above to start tracking costs.</p>
          </div>
        ) : expenses.length === 0 ? null : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('date')}>Date{sortIndicator('date')}</th>
                <th className="sortable" onClick={() => toggleSort('property')}>Property{sortIndicator('property')}</th>
                <th className="sortable" onClick={() => toggleSort('category')}>Category{sortIndicator('category')}</th>
                <th className="sortable" onClick={() => toggleSort('description')}>Description{sortIndicator('description')}</th>
                <th className="sortable" onClick={() => toggleSort('amount')}>Amount{sortIndicator('amount')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagination.paged.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.date)}{e.recurring && <span className="badge small" style={{ marginLeft: 4 }}>recurring</span>}</td>
                  <td>
                    {properties.find((p) => p.id === e.propertyId)?.name ?? '—'}
                    {e.unitId && <span className="muted"> — {units.find((u) => u.id === e.unitId)?.name}</span>}
                  </td>
                  <td>{CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}</td>
                  <td>{e.description}</td>
                  <td className="negative">{formatMoney(e.amount)}</td>
                  <td className="actions-cell">
                    <button type="button" className="btn small" onClick={() => openEdit(e)}>Edit</button>
                    <button type="button" className="btn small danger" onClick={async () => { if (await confirm({ title: 'Delete expense', message: `Delete "${e.description}"?`, confirmText: 'Delete', danger: true })) { const snap = takeSnapshot(); deleteExpense(e.id); toast('Expense deleted', { action: { label: 'Undo', onClick: () => { restoreSnapshot(snap); toast('Expense restored', 'info') } } }) } }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sortedExpenses.length > 0 && <Pagination pagination={pagination} />}
    </div>
  )
}
