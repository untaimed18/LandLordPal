import { Link } from 'react-router-dom'
import type { Expense, ExpenseCategory } from '../types'
import { formatMoney, formatDate } from '../lib/format'

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
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

interface Props {
  expenses: Expense[]
}

export default function PropertyExpenses({ expenses }: Props) {
  return (
    <section className="card section-card" aria-label="Property expenses">
      <h2>Expenses (this property)</h2>
      <p className="muted">Add expenses from the <Link to="/expenses">Expenses</Link> page and assign this property.</p>
      {expenses.length === 0 ? (
        <p className="empty-state">No expenses for this property.</p>
      ) : (
        <table className="data-table">
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
          <tbody>
            {expenses
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 10)
              .map((e) => (
                <tr key={e.id}><td>{formatDate(e.date)}</td><td>{EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}</td><td>{e.description}</td><td className="negative">{formatMoney(e.amount)}</td></tr>
              ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
