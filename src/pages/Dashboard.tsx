import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { loadSettings } from '../lib/settings'
import {
  getDashboardStats,
  getPropertySummary,
  getRentRollForMonth,
  getLeasesEndingSoon,
} from '../lib/calculations'
import { formatMoney, formatPct } from '../lib/format'
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
  TrendingUp,
  TrendingDown,
  DoorOpen,
  AlertTriangle,
  ChevronRight,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

export default function Dashboard() {
  const { properties, units, tenants, expenses, payments, maintenanceRequests } = useStore()
  const settings = loadSettings()
  const stats = getDashboardStats(properties, units, tenants, expenses, payments)
  const summaries = properties.map((p) =>
    getPropertySummary(p, units, tenants, expenses, payments)
  )
  const now = new Date()
  const rentRoll = getRentRollForMonth(now.getFullYear(), now.getMonth(), properties, units, tenants, payments)
  const notPaidThisMonth = rentRoll.filter((r) => !r.paid)
  const leasesEndingSoon = getLeasesEndingSoon(tenants, settings.leaseWarningDays)
  const openMaintenance = maintenanceRequests.filter((r) => r.status !== 'completed')

  const insuranceAlerts = properties.filter((p) => {
    if (!p.insuranceExpiry) return false
    const expiry = new Date(p.insuranceExpiry + 'T12:00:00')
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysLeft >= 0 && daysLeft <= settings.insuranceWarningDays
  }).map((p) => {
    const expiry = new Date(p.insuranceExpiry! + 'T12:00:00')
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return { property: p, daysLeft }
  }).sort((a, b) => a.daysLeft - b.daysLeft)

  const scheduledMaintenance = maintenanceRequests.filter((r) => {
    if (!r.scheduledDate || r.status === 'completed') return false
    const scheduled = new Date(r.scheduledDate + 'T12:00:00')
    const daysUntil = Math.ceil((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntil >= 0 && daysUntil <= settings.maintenanceLookaheadDays
  }).sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''))

  const notificationCount = leasesEndingSoon.length + insuranceAlerts.length + scheduledMaintenance.length

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfMonth = today.getDate()
  const lateRentItems = notPaidThisMonth.filter((r) => {
    const graceDays = r.tenant.gracePeriodDays ?? settings.defaultGracePeriodDays
    return dayOfMonth > graceDays && (r.tenant.lateFeeAmount ?? 0) > 0
  })

  const hasData = properties.length > 0

  const vacancyCost = units
    .filter((u) => !tenants.some((t) => t.unitId === u.id))
    .reduce((sum, u) => sum + u.monthlyRent, 0)

  const collectionRate = stats.expectedMonthlyRent > 0
    ? (stats.collectedThisMonth / stats.expectedMonthlyRent) * 100
    : 0

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-desc">
            {hasData
              ? `${monthNames[now.getMonth()]} ${now.getFullYear()} — ${properties.length} propert${properties.length !== 1 ? 'ies' : 'y'}, ${tenants.length} tenant${tenants.length !== 1 ? 's' : ''}`
              : 'Your portfolio at a glance.'}
          </p>
        </div>
      </div>

      {!hasData && (
        <div className="welcome-card card" role="region" aria-label="Welcome">
          <div className="welcome-icon"><Building2 size={40} aria-hidden="true" /></div>
          <h2>Welcome to LandLord Pal</h2>
          <p className="welcome-text">Get started by adding your first property. Then add units, assign tenants, and start tracking rent payments and expenses — all from one place.</p>
          <div className="welcome-actions">
            <Link to="/properties" className="btn primary">Add your first property</Link>
            <Link to="/settings" className="btn">Import existing data</Link>
          </div>
          <div className="welcome-features">
            <div className="welcome-feature">
              <Home size={18} className="welcome-feature-icon" aria-hidden="true" />
              <span>Track properties &amp; units</span>
            </div>
            <div className="welcome-feature">
              <DollarSign size={18} className="welcome-feature-icon" aria-hidden="true" />
              <span>Record rent payments</span>
            </div>
            <div className="welcome-feature">
              <BarChart3 size={18} className="welcome-feature-icon" aria-hidden="true" />
              <span>Financial reports</span>
            </div>
            <div className="welcome-feature">
              <Wrench size={18} className="welcome-feature-icon" aria-hidden="true" />
              <span>Maintenance tracking</span>
            </div>
          </div>
        </div>
      )}

      {hasData && (
        <>
          <div className="dash-hero" role="region" aria-label="Financial overview">
            <div className="dash-hero-card dash-hero-primary">
              <div className="dash-hero-icon-wrap">
                <DollarSign size={22} aria-hidden="true" />
              </div>
              <div className="dash-hero-content">
                <span className="dash-hero-label">Net cash flow</span>
                <span className={`dash-hero-value ${stats.netCashFlow >= 0 ? 'positive' : 'negative'}`}>
                  {formatMoney(stats.netCashFlow)}
                </span>
                <span className="dash-hero-sub">This month</span>
              </div>
            </div>
            <div className="dash-hero-card">
              <div className="dash-hero-icon-wrap income">
                <TrendingUp size={20} aria-hidden="true" />
              </div>
              <div className="dash-hero-content">
                <span className="dash-hero-label">Collected</span>
                <span className="dash-hero-value positive">{formatMoney(stats.collectedThisMonth)}</span>
                <span className="dash-hero-sub">
                  of {formatMoney(stats.expectedMonthlyRent)} expected
                  {stats.expectedMonthlyRent > 0 && (
                    <span className="dash-hero-pct">{Math.round(collectionRate)}%</span>
                  )}
                </span>
              </div>
            </div>
            <div className="dash-hero-card">
              <div className="dash-hero-icon-wrap expense">
                <TrendingDown size={20} aria-hidden="true" />
              </div>
              <div className="dash-hero-content">
                <span className="dash-hero-label">Expenses</span>
                <span className="dash-hero-value negative">{formatMoney(stats.expensesThisMonth)}</span>
                <span className="dash-hero-sub">This month</span>
              </div>
            </div>
          </div>

          <div className="dash-stats-row" role="region" aria-label="Portfolio statistics">
            <div className="dash-stat">
              <div className="dash-stat-icon"><DoorOpen size={16} aria-hidden="true" /></div>
              <div>
                <span className="dash-stat-label">Occupancy</span>
                <span className="dash-stat-value">
                  {stats.totalUnits === 0 ? '—' : `${stats.occupiedUnits}/${stats.totalUnits}`}
                  {stats.totalUnits > 0 && <span className="dash-stat-pct">{formatPct(stats.occupancyRate)}</span>}
                </span>
              </div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-icon income"><ArrowUpRight size={16} aria-hidden="true" /></div>
              <div>
                <span className="dash-stat-label">YTD income</span>
                <span className="dash-stat-value positive">{formatMoney(stats.ytdIncome)}</span>
              </div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-icon expense"><ArrowDownRight size={16} aria-hidden="true" /></div>
              <div>
                <span className="dash-stat-label">YTD expenses</span>
                <span className="dash-stat-value negative">{formatMoney(stats.ytdExpenses)}</span>
              </div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-icon"><DollarSign size={16} aria-hidden="true" /></div>
              <div>
                <span className="dash-stat-label">YTD profit</span>
                <span className={`dash-stat-value ${stats.ytdIncome - stats.ytdExpenses >= 0 ? 'positive' : 'negative'}`}>
                  {formatMoney(stats.ytdIncome - stats.ytdExpenses)}
                </span>
              </div>
            </div>
            {vacancyCost > 0 && (
              <div className="dash-stat">
                <div className="dash-stat-icon warning"><AlertTriangle size={16} aria-hidden="true" /></div>
                <div>
                  <span className="dash-stat-label">Vacancy loss</span>
                  <span className="dash-stat-value negative">{formatMoney(vacancyCost)}/mo</span>
                </div>
              </div>
            )}
            {openMaintenance.length > 0 && (
              <div className="dash-stat">
                <div className="dash-stat-icon warning"><Wrench size={16} aria-hidden="true" /></div>
                <div>
                  <span className="dash-stat-label">Open repairs</span>
                  <span className="dash-stat-value">{openMaintenance.length}</span>
                </div>
              </div>
            )}
          </div>

          <nav className="dash-quick-actions" aria-label="Quick actions">
            <Link to="/rent" className="dash-qa">
              <Banknote size={18} aria-hidden="true" />
              <span>Record payment</span>
            </Link>
            <Link to="/expenses" className="dash-qa">
              <Receipt size={18} aria-hidden="true" />
              <span>Add expense</span>
            </Link>
            <Link to="/maintenance" className="dash-qa">
              <Wrench size={18} aria-hidden="true" />
              <span>Maintenance</span>
            </Link>
            <Link to="/properties" className="dash-qa">
              <Home size={18} aria-hidden="true" />
              <span>Properties</span>
            </Link>
            <Link to="/calendar" className="dash-qa">
              <CalendarDays size={18} aria-hidden="true" />
              <span>Calendar</span>
            </Link>
            <Link to="/reports" className="dash-qa">
              <BarChart3 size={18} aria-hidden="true" />
              <span>Reports</span>
            </Link>
          </nav>
        </>
      )}

      {hasData && notificationCount > 0 && (
        <section className="dash-section" aria-label="Reminders">
          <div className="dash-section-header">
            <h2><Bell size={18} aria-hidden="true" /> Reminders</h2>
            <span className="dash-section-count">{notificationCount}</span>
          </div>
          <div className="dash-notification-list">
            {insuranceAlerts.map(({ property: p, daysLeft }) => (
              <Link key={`ins-${p.id}`} to={`/properties/${p.id}`} className="dash-notif dash-notif-warning">
                <Shield size={16} className="dash-notif-icon" aria-hidden="true" />
                <div className="dash-notif-body">
                  <strong>{p.name}</strong>
                  <span>Insurance expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}{p.insuranceProvider ? ` (${p.insuranceProvider})` : ''}</span>
                </div>
                <ChevronRight size={16} className="dash-notif-arrow" aria-hidden="true" />
              </Link>
            ))}
            {scheduledMaintenance.map((m) => {
              const prop = properties.find((p) => p.id === m.propertyId)
              const daysUntil = Math.ceil((new Date(m.scheduledDate! + 'T12:00:00').getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
              return (
                <Link key={`sched-${m.id}`} to="/maintenance" className="dash-notif dash-notif-info">
                  <Clock size={16} className="dash-notif-icon" aria-hidden="true" />
                  <div className="dash-notif-body">
                    <strong>{m.title}</strong>
                    <span>{prop && `${prop.name} · `}Scheduled in {daysUntil} day{daysUntil !== 1 ? 's' : ''}</span>
                  </div>
                  <ChevronRight size={16} className="dash-notif-arrow" aria-hidden="true" />
                </Link>
              )
            })}
            {leasesEndingSoon.slice(0, 5).map(({ tenant, daysLeft }) => (
              <Link key={`lease-${tenant.id}`} to={`/properties/${tenant.propertyId}`} className="dash-notif dash-notif-alert">
                <CalendarDays size={16} className="dash-notif-icon" aria-hidden="true" />
                <div className="dash-notif-body">
                  <strong>{tenant.name}</strong>
                  <span>Lease ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
                </div>
                <ChevronRight size={16} className="dash-notif-arrow" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {lateRentItems.length > 0 && (
        <section className="dash-section dash-section-alert" aria-label="Late rent">
          <div className="dash-section-header">
            <h2><AlertTriangle size={18} aria-hidden="true" /> Late rent</h2>
            <span className="dash-section-count alert">{lateRentItems.length}</span>
          </div>
          <p className="dash-section-desc">Past grace period — late fees applicable.</p>
          <div className="dash-list">
            {lateRentItems.map((r) => (
              <Link key={r.tenant.id} to={`/properties/${r.property.id}`} className="dash-list-item">
                <span className="badge expired">Late</span>
                <div className="dash-list-body">
                  <strong>{r.tenant.name}</strong>
                  <span>{r.property.name} · Owed: {formatMoney(r.expectedRent)}
                    {r.tenant.lateFeeAmount != null && r.tenant.lateFeeAmount > 0 && ` + ${formatMoney(r.tenant.lateFeeAmount)} fee`}
                  </span>
                </div>
                <ChevronRight size={16} className="dash-notif-arrow" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {notPaidThisMonth.length > 0 && (
        <section className="dash-section" aria-label="Rent due this month">
          <div className="dash-section-header">
            <h2><Banknote size={18} aria-hidden="true" /> Rent due this month</h2>
            <span className="dash-section-count">{notPaidThisMonth.length}</span>
          </div>
          <div className="dash-list">
            {notPaidThisMonth.map((r) => (
              <Link key={r.tenant.id} to={`/properties/${r.property.id}`} className="dash-list-item">
                <div className="dash-list-body">
                  <strong>{r.tenant.name}</strong>
                  <span>{r.property.name} · {formatMoney(r.expectedRent)}
                    {r.paidAmount > 0 && ` (${formatMoney(r.paidAmount)} paid)`}
                  </span>
                </div>
                <ChevronRight size={16} className="dash-notif-arrow" aria-hidden="true" />
              </Link>
            ))}
          </div>
          <div className="dash-section-footer">
            <Link to="/rent" className="btn small">View full rent roll <ChevronRight size={14} aria-hidden="true" /></Link>
          </div>
        </section>
      )}

      {openMaintenance.length > 0 && (
        <section className="dash-section" aria-label="Open maintenance">
          <div className="dash-section-header">
            <h2><Wrench size={18} aria-hidden="true" /> Open maintenance</h2>
            <span className="dash-section-count">{openMaintenance.length}</span>
          </div>
          <div className="dash-list">
            {openMaintenance.slice(0, 5).map((r) => {
              const prop = properties.find((p) => p.id === r.propertyId)
              return (
                <Link key={r.id} to="/maintenance" className="dash-list-item">
                  <span className={`badge priority-${r.priority}`}>{r.priority}</span>
                  <div className="dash-list-body">
                    <strong>{r.title}</strong>
                    {prop && <span>{prop.name}</span>}
                  </div>
                  <ChevronRight size={16} className="dash-notif-arrow" aria-hidden="true" />
                </Link>
              )
            })}
          </div>
          {openMaintenance.length > 5 && (
            <div className="dash-section-footer">
              <Link to="/maintenance" className="btn small">View all {openMaintenance.length} requests <ChevronRight size={14} aria-hidden="true" /></Link>
            </div>
          )}
        </section>
      )}

      {hasData && (
        <section className="dash-section" aria-label="Properties overview">
          <div className="dash-section-header">
            <h2><Building2 size={18} aria-hidden="true" /> Properties</h2>
            <Link to="/properties" className="btn small">View all <ChevronRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="dash-property-grid">
            {summaries.map((s) => (
              <Link key={s.property.id} to={`/properties/${s.property.id}`} className="dash-prop-card">
                <div className="dash-prop-header">
                  <h3>{s.property.name}</h3>
                  <span className={`dash-prop-occ ${s.occupancyRate >= 1 ? 'full' : s.occupancyRate > 0 ? 'partial' : 'empty'}`}>
                    {formatPct(s.occupancyRate)}
                  </span>
                </div>
                <p className="dash-prop-addr"><MapPin size={12} aria-hidden="true" /> {s.property.address}, {s.property.city}</p>
                <div className="dash-prop-metrics">
                  <div className="dash-prop-metric">
                    <span className="dash-prop-metric-label">Rent</span>
                    <span className="dash-prop-metric-value">{formatMoney(s.totalMonthlyRent)}</span>
                  </div>
                  <div className="dash-prop-metric">
                    <span className="dash-prop-metric-label">Collected</span>
                    <span className="dash-prop-metric-value positive">{formatMoney(s.collectedThisMonth)}</span>
                  </div>
                  <div className="dash-prop-metric">
                    <span className="dash-prop-metric-label">Expenses</span>
                    <span className="dash-prop-metric-value negative">{formatMoney(s.expensesThisMonth)}</span>
                  </div>
                  <div className="dash-prop-metric">
                    <span className="dash-prop-metric-label">Net</span>
                    <span className={`dash-prop-metric-value ${s.netThisMonth >= 0 ? 'positive' : 'negative'}`}>
                      {formatMoney(s.netThisMonth)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
