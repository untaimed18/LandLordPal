import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import {
  getDashboardStats,
  getPropertySummary,
  getRentRollForMonth,
  getLeasesEndingSoon,
} from '../lib/calculations'
import { formatMoney, formatPct, formatDate } from '../lib/format'
import {
  Building2,
  Banknote,
  Receipt,
  Wrench,
  Home,
  BarChart3,
  CalendarDays,
  DollarSign,
  Shield,
  Clock,
  Bell,
} from 'lucide-react'

const LEASES_SOON_DAYS = 90
const INSURANCE_ALERT_DAYS = 60

export default function Dashboard() {
  const { properties, units, tenants, expenses, payments, maintenanceRequests } = useStore()
  const stats = getDashboardStats(properties, units, tenants, expenses, payments)
  const summaries = properties.map((p) =>
    getPropertySummary(p, units, tenants, expenses, payments)
  )
  const now = new Date()
  const rentRoll = getRentRollForMonth(now.getFullYear(), now.getMonth(), properties, units, tenants, payments)
  const notPaidThisMonth = rentRoll.filter((r) => !r.paid)
  const leasesEndingSoon = getLeasesEndingSoon(tenants, LEASES_SOON_DAYS)
  const openMaintenance = maintenanceRequests.filter((r) => r.status !== 'completed')

  // Insurance expiring soon
  const insuranceAlerts = properties.filter((p) => {
    if (!p.insuranceExpiry) return false
    const expiry = new Date(p.insuranceExpiry + 'T12:00:00')
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysLeft >= 0 && daysLeft <= INSURANCE_ALERT_DAYS
  }).map((p) => {
    const expiry = new Date(p.insuranceExpiry! + 'T12:00:00')
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return { property: p, daysLeft }
  }).sort((a, b) => a.daysLeft - b.daysLeft)

  // Scheduled maintenance coming up (next 30 days)
  const scheduledMaintenance = maintenanceRequests.filter((r) => {
    if (!r.scheduledDate || r.status === 'completed') return false
    const scheduled = new Date(r.scheduledDate + 'T12:00:00')
    const daysUntil = Math.ceil((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntil >= 0 && daysUntil <= 30
  }).sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''))

  // Total notification count
  const notificationCount = leasesEndingSoon.length + insuranceAlerts.length + scheduledMaintenance.length

  // Late fee detection
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfMonth = today.getDate()
  const lateRentItems = notPaidThisMonth.filter((r) => {
    const graceDays = r.tenant.gracePeriodDays ?? 5
    return dayOfMonth > graceDays && (r.tenant.lateFeeAmount ?? 0) > 0
  })

  const hasData = properties.length > 0

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-desc">Your portfolio at a glance. All numbers update automatically.</p>
        </div>
        
      </div>

      {!hasData && (
        <div className="welcome-card card">
          <div className="welcome-icon"><Building2 size={40} /></div>
          <h2>Welcome to LandLord Pal</h2>
          <p className="welcome-text">Get started by adding your first property. Then add units, assign tenants, and start tracking rent payments and expenses — all from one place.</p>
          <div className="welcome-actions">
            <Link to="/properties" className="btn primary">Add your first property</Link>
            <Link to="/settings" className="btn">Import existing data</Link>
          </div>
          <div className="welcome-features">
            <div className="welcome-feature">
              <Home size={18} className="welcome-feature-icon" />
              <span>Track properties & units</span>
            </div>
            <div className="welcome-feature">
              <DollarSign size={18} className="welcome-feature-icon" />
              <span>Record rent payments</span>
            </div>
            <div className="welcome-feature">
              <BarChart3 size={18} className="welcome-feature-icon" />
              <span>Financial reports</span>
            </div>
            <div className="welcome-feature">
              <Wrench size={18} className="welcome-feature-icon" />
              <span>Maintenance tracking</span>
            </div>
          </div>
        </div>
      )}

      {hasData && (
        <>
          <div className="quick-actions">
            <Link to="/rent" className="quick-action-btn">
              <Banknote size={20} className="quick-action-icon" />
              <span>Record payment</span>
            </Link>
            <Link to="/expenses" className="quick-action-btn">
              <Receipt size={20} className="quick-action-icon" />
              <span>Add expense</span>
            </Link>
            <Link to="/maintenance" className="quick-action-btn">
              <Wrench size={20} className="quick-action-icon" />
              <span>New maintenance</span>
            </Link>
            <Link to="/properties" className="quick-action-btn">
              <Home size={20} className="quick-action-icon" />
              <span>Add property</span>
            </Link>
            <Link to="/calendar" className="quick-action-btn">
              <CalendarDays size={20} className="quick-action-icon" />
              <span>Calendar</span>
            </Link>
            <Link to="/reports" className="quick-action-btn">
              <BarChart3 size={20} className="quick-action-icon" />
              <span>Reports</span>
            </Link>
          </div>

          <section className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Expected monthly rent</span>
              <span className="stat-value">{formatMoney(stats.expectedMonthlyRent)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Collected this month</span>
              <span className="stat-value positive">{formatMoney(stats.collectedThisMonth)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Expenses this month</span>
              <span className="stat-value negative">{formatMoney(stats.expensesThisMonth)}</span>
            </div>
            <div className="stat-card highlight">
              <span className="stat-label">Net cash flow (this month)</span>
              <span className="stat-value">{formatMoney(stats.netCashFlow)}</span>
            </div>
          </section>

          <section className="stats-grid two">
            <div className="stat-card">
              <span className="stat-label">Occupancy</span>
              <span className="stat-value">
                {stats.totalUnits === 0 ? '—' : `${stats.occupiedUnits} / ${stats.totalUnits} (${formatPct(stats.occupancyRate)})`}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">YTD income</span>
              <span className="stat-value positive">{formatMoney(stats.ytdIncome)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">YTD expenses</span>
              <span className="stat-value negative">{formatMoney(stats.ytdExpenses)}</span>
            </div>
            <div className="stat-card highlight">
              <span className="stat-label">YTD net profit</span>
              <span className={`stat-value ${stats.ytdIncome - stats.ytdExpenses >= 0 ? 'positive' : 'negative'}`}>
                {formatMoney(stats.ytdIncome - stats.ytdExpenses)}
              </span>
            </div>
            {stats.totalUnits > stats.occupiedUnits && (
              <div className="stat-card">
                <span className="stat-label">Vacancy cost (monthly)</span>
                <span className="stat-value negative">
                  {formatMoney(
                    units
                      .filter((u) => !tenants.some((t) => t.unitId === u.id))
                      .reduce((sum, u) => sum + u.monthlyRent, 0)
                  )}
                </span>
              </div>
            )}
            {openMaintenance.length > 0 && (
              <div className="stat-card">
                <span className="stat-label">Open maintenance</span>
                <span className="stat-value negative">{openMaintenance.length}</span>
              </div>
            )}
          </section>
        </>
      )}

      {hasData && notificationCount > 0 && (
        <section className="card section-card notification-center" style={{ marginTop: '1.5rem' }}>
          <div className="section-card-header">
            <h2><Bell size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Reminders ({notificationCount})</h2>
          </div>
          <div className="notification-list">
            {insuranceAlerts.map(({ property: p, daysLeft }) => (
              <div key={`ins-${p.id}`} className="notification-item notification-warning">
                <Shield size={16} />
                <span><strong>{p.name}</strong> — insurance expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''} ({p.insuranceProvider ?? 'Policy'})</span>
                <Link to={`/properties/${p.id}`} className="btn small">View</Link>
              </div>
            ))}
            {scheduledMaintenance.map((m) => {
              const prop = properties.find((p) => p.id === m.propertyId)
              const daysUntil = Math.ceil((new Date(m.scheduledDate! + 'T12:00:00').getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
              return (
                <div key={`sched-${m.id}`} className="notification-item notification-info">
                  <Clock size={16} />
                  <span><strong>{m.title}</strong>{prop && ` — ${prop.name}`} · Scheduled in {daysUntil} day{daysUntil !== 1 ? 's' : ''}</span>
                  <Link to="/maintenance" className="btn small">View</Link>
                </div>
              )
            })}
            {leasesEndingSoon.slice(0, 5).map(({ tenant, daysLeft }) => (
              <div key={`lease-${tenant.id}`} className="notification-item notification-alert">
                <CalendarDays size={16} />
                <span><strong>{tenant.name}</strong> — lease ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
                <Link to={`/properties/${tenant.propertyId}`} className="btn small">View</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {lateRentItems.length > 0 && (
        <section className="card section-card alert-section">
          <h2>Late rent — past grace period</h2>
          <p className="section-desc">{lateRentItems.length} tenant{lateRentItems.length !== 1 ? 's' : ''} past grace period with late fees applicable.</p>
          <ul className="rent-due-list">
            {lateRentItems.map((r) => (
              <li key={r.tenant.id}>
                <span className="badge expired">Late</span>
                <strong>{r.tenant.name}</strong> — {r.property.name}, {r.unit.name} · Owed: {formatMoney(r.expectedRent)}
                {r.tenant.lateFeeAmount != null && r.tenant.lateFeeAmount > 0 && (
                  <span className="muted"> · Late fee: {formatMoney(r.tenant.lateFeeAmount)}</span>
                )}
                <Link to={`/properties/${r.property.id}`} className="btn small primary">Record payment</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notPaidThisMonth.length > 0 && (
        <section className="card section-card alert-section">
          <h2>Rent due this month</h2>
          <p className="section-desc">{notPaidThisMonth.length} tenant{notPaidThisMonth.length !== 1 ? 's' : ''} haven&apos;t paid yet.</p>
          <ul className="rent-due-list">
            {notPaidThisMonth.map((r) => (
              <li key={r.tenant.id}>
                <strong>{r.tenant.name}</strong> — {r.property.name}, {r.unit.name} · {formatMoney(r.expectedRent)}
                {r.paidAmount > 0 && <span className="badge partial">Partial: {formatMoney(r.paidAmount)}</span>}
                <Link to={`/properties/${r.property.id}`} className="btn small primary">Record payment</Link>
              </li>
            ))}
          </ul>
          <Link to="/rent" className="btn primary">View rent roll</Link>
        </section>
      )}

      {openMaintenance.length > 0 && (
        <section className="card section-card">
          <h2>Open maintenance requests</h2>
          <ul className="rent-due-list">
            {openMaintenance.slice(0, 5).map((r) => {
              const prop = properties.find((p) => p.id === r.propertyId)
              return (
                <li key={r.id}>
                  <span className={`badge priority-${r.priority}`}>{r.priority}</span>
                  <strong>{r.title}</strong>
                  {prop && <span className="muted"> — {prop.name}</span>}
                </li>
              )
            })}
          </ul>
          <Link to="/maintenance" className="btn">View all requests</Link>
        </section>
      )}

      {leasesEndingSoon.length > 0 && (
        <section className="card section-card">
          <h2>Leases ending soon</h2>
          <p className="section-desc">Within the next {LEASES_SOON_DAYS} days.</p>
          <ul className="leases-list">
            {leasesEndingSoon.slice(0, 10).map(({ tenant, daysLeft }) => (
              <li key={tenant.id}>
                <strong>{tenant.name}</strong> — Lease ends {formatDate(tenant.leaseEnd)} ({daysLeft} days)
                <Link to={`/properties/${tenant.propertyId}`} className="btn small">View property</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasData && (
        <section className="section">
          <h2>Properties</h2>
          <div className="property-cards">
            {summaries.map((s) => (
              <Link key={s.property.id} to={`/properties/${s.property.id}`} className="property-card">
                <div className="property-card-header">
                  <h3>{s.property.name}</h3>
                  <span className="occupancy-badge">{formatPct(s.occupancyRate)} occupied</span>
                </div>
                <p className="property-address">{s.property.address}, {s.property.city}</p>
                <div className="property-metrics">
                  <span>Rent: {formatMoney(s.totalMonthlyRent)}</span>
                  <span>Collected: {formatMoney(s.collectedThisMonth)}</span>
                  <span>Expenses: {formatMoney(s.expensesThisMonth)}</span>
                  <span className={s.netThisMonth >= 0 ? 'positive' : 'negative'}>
                    Net: {formatMoney(s.netThisMonth)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
