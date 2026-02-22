import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { loadSettings } from '../lib/settings'
import {
  getDashboardStats,
  getPropertySummary,
  getRentRollForMonth,
  getLeasesEndingSoon,
  getInvestmentMetrics,
  getForecast,
  getYoYTrends,
} from '../lib/calculations'
import type { Property, Unit, Tenant, Expense, Payment } from '../types'
import { formatMoney, formatPct } from '../lib/format'
import Sparkline from '../components/Sparkline'
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
  Info,
  Activity,
  Mail,
} from 'lucide-react'

export default function Dashboard() {
  const { properties, units, tenants, expenses, payments, maintenanceRequests } = useStore()
  const settings = loadSettings()
  const [propertyFilter, setPropertyFilter] = useState('')
  const fp = propertyFilter ? properties.filter(p => p.id === propertyFilter) : properties
  const fu = propertyFilter ? units.filter(u => u.propertyId === propertyFilter) : units
  const ft = propertyFilter ? tenants.filter(t => t.propertyId === propertyFilter) : tenants
  const fe = propertyFilter ? expenses.filter(e => e.propertyId === propertyFilter) : expenses
  const fPay = propertyFilter ? payments.filter(p => p.propertyId === propertyFilter) : payments
  const fMaint = propertyFilter ? maintenanceRequests.filter(m => m.propertyId === propertyFilter) : maintenanceRequests
  const stats = getDashboardStats(fp, fu, ft, fe, fPay)
  const summaries = fp.map((p) =>
    getPropertySummary(p, units, tenants, expenses, payments)
  )
  const now = new Date()
  const rentRoll = getRentRollForMonth(now.getFullYear(), now.getMonth(), fp, fu, ft, fPay)
  const notPaidThisMonth = rentRoll.filter((r) => !r.paid)
  const leasesEndingSoon = getLeasesEndingSoon(ft, settings.leaseWarningDays)
  const openMaintenance = fMaint.filter((r) => r.status !== 'completed')

  const insuranceAlerts = fp.filter((p) => {
    if (!p.insuranceExpiry) return false
    const expiry = new Date(p.insuranceExpiry + 'T12:00:00')
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysLeft >= 0 && daysLeft <= settings.insuranceWarningDays
  }).map((p) => {
    const expiry = new Date(p.insuranceExpiry! + 'T12:00:00')
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return { property: p, daysLeft }
  }).sort((a, b) => a.daysLeft - b.daysLeft)

  const scheduledMaintenance = fMaint.filter((r) => {
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

  const investmentMetrics = useMemo(
    () => getInvestmentMetrics(fp, fu, ft, fe, fPay, now.getFullYear()),
    [fp, fu, ft, fe, fPay],
  )

  const forecast = useMemo(
    () => getForecast(ft, fe, fPay),
    [ft, fe, fPay],
  )

  const yoyTrends = useMemo(
    () => getYoYTrends(fPay, fe),
    [fPay, fe],
  )

  const [tooltipId, setTooltipId] = useState<string | null>(null)

  const hasData = properties.length > 0

  const rentReminders = useMemo(() => {
    const dayOfMonth = now.getDate()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysUntilFirst = dayOfMonth <= 1 ? (1 - dayOfMonth) : (daysInMonth - dayOfMonth + 1)
    if (daysUntilFirst > settings.rentReminderDays) return []
    return notPaidThisMonth.filter((r) => r.tenant.email)
  }, [notPaidThisMonth, now, settings.rentReminderDays])

  const vacancyCost = fu
    .filter((u) => !ft.some((t) => t.unitId === u.id))
    .reduce((sum, u) => sum + u.monthlyRent, 0)

  const collectionRate = stats.expectedMonthlyRent > 0
    ? (stats.collectedThisMonth / stats.expectedMonthlyRent) * 100
    : 0

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  const monthlyTrend = useMemo(() => {
    const months: { label: string; income: number; expenses: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1)
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const income = fPay.filter((p) => p.date.startsWith(prefix)).reduce((s, p) => s + p.amount, 0)
      const exp = fe.filter((e) => e.date.startsWith(prefix)).reduce((s, e) => s + e.amount, 0)
      months.push({ label: monthNames[d.getMonth()], income, expenses: exp })
    }
    return months
  }, [fPay, fe, currentYear, currentMonth])

  const incomeData = monthlyTrend.map((m) => m.income)
  const expenseData = monthlyTrend.map((m) => m.expenses)

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-desc">
            {hasData
              ? `${monthNames[now.getMonth()]} ${now.getFullYear()} — ${fp.length} propert${fp.length !== 1 ? 'ies' : 'y'}, ${ft.length} tenant${ft.length !== 1 ? 's' : ''}`
              : 'Your portfolio at a glance.'}
          </p>
        </div>
        {properties.length > 1 && (
          <select className="select-inline" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
            <option value="">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
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
              <Sparkline data={incomeData} color="var(--positive)" />
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
              <Sparkline data={expenseData} color="var(--negative)" />
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

          {monthlyTrend.some((m) => m.income > 0 || m.expenses > 0) && (
            <section className="card section-card dash-trend-section" style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ marginBottom: '1rem' }}>6-Month Trend</h2>
              <div className="dash-trend-chart">
                {(() => {
                  const maxVal = Math.max(...monthlyTrend.map((m) => Math.max(m.income, m.expenses)), 1)
                  return monthlyTrend.map((m, i) => (
                    <div key={i} className="dash-trend-col">
                      <div className="dash-trend-bars">
                        <div className="dash-trend-bar income" style={{ height: `${(m.income / maxVal) * 100}%` }} title={`Income: ${formatMoney(m.income)}`} />
                        <div className="dash-trend-bar expense" style={{ height: `${(m.expenses / maxVal) * 100}%` }} title={`Expenses: ${formatMoney(m.expenses)}`} />
                      </div>
                      <span className="dash-trend-label">{m.label}</span>
                    </div>
                  ))
                })()}
              </div>
              <div className="dash-trend-legend">
                <span className="dash-trend-legend-item"><span className="dash-trend-dot income" />Income</span>
                <span className="dash-trend-legend-item"><span className="dash-trend-dot expense" />Expenses</span>
              </div>
            </section>
          )}

          {(investmentMetrics.annualIncome > 0 || investmentMetrics.annualExpenses > 0) && (
            <section className="card section-card dash-metrics-section" style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ marginBottom: '1rem' }}>Investment Metrics — {now.getFullYear()}</h2>
              <div className="metrics-grid">
                <MetricCard
                  label="Net Operating Income"
                  value={formatMoney(investmentMetrics.noi)}
                  positive={investmentMetrics.noi >= 0}
                  tooltip="Annual rental income minus operating expenses (excluding mortgage)."
                  id="noi"
                  tooltipId={tooltipId}
                  setTooltipId={setTooltipId}
                />
                {investmentMetrics.capRate != null && (
                  <MetricCard
                    label="Cap Rate"
                    value={`${investmentMetrics.capRate.toFixed(1)}%`}
                    positive={investmentMetrics.capRate > 0}
                    tooltip="NOI / Purchase Price. Measures return independent of financing."
                    id="caprate"
                    tooltipId={tooltipId}
                    setTooltipId={setTooltipId}
                  />
                )}
                {investmentMetrics.cashOnCash != null && (
                  <MetricCard
                    label="Cash-on-Cash"
                    value={`${investmentMetrics.cashOnCash.toFixed(1)}%`}
                    positive={investmentMetrics.cashOnCash > 0}
                    tooltip="(NOI − Mortgage) / Purchase Price. Factors in debt service."
                    id="coc"
                    tooltipId={tooltipId}
                    setTooltipId={setTooltipId}
                  />
                )}
                {investmentMetrics.expenseRatio != null && (
                  <MetricCard
                    label="Expense Ratio"
                    value={`${investmentMetrics.expenseRatio.toFixed(1)}%`}
                    positive={investmentMetrics.expenseRatio <= 45}
                    tooltip="Total Expenses / Gross Income. Healthy is typically 35–45%."
                    id="expratio"
                    tooltipId={tooltipId}
                    setTooltipId={setTooltipId}
                  />
                )}
                {investmentMetrics.grm != null && (
                  <MetricCard
                    label="GRM"
                    value={investmentMetrics.grm.toFixed(1)}
                    tooltip="Gross Rent Multiplier: Purchase Price / Annual Rent. Lower = better value."
                    id="grm"
                    tooltipId={tooltipId}
                    setTooltipId={setTooltipId}
                  />
                )}
                {investmentMetrics.annualVacancyLoss > 0 && (
                  <MetricCard
                    label="Vacancy Loss"
                    value={formatMoney(investmentMetrics.annualVacancyLoss)}
                    positive={false}
                    tooltip="Annual lost rent from vacant units at their listed rent."
                    id="vacloss"
                    tooltipId={tooltipId}
                    setTooltipId={setTooltipId}
                  />
                )}
              </div>
              {yoyTrends.length >= 2 && (() => {
                const latest = yoyTrends[yoyTrends.length - 1];
                return (
                  <div className="yoy-indicators">
                    {latest.incomeGrowth != null && (
                      <span className={`yoy-chip ${latest.incomeGrowth >= 0 ? 'positive' : 'negative'}`}>
                        {latest.incomeGrowth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        Income {latest.incomeGrowth >= 0 ? '+' : ''}{latest.incomeGrowth.toFixed(1)}% YoY
                      </span>
                    )}
                    {latest.expenseGrowth != null && (
                      <span className={`yoy-chip ${latest.expenseGrowth <= 0 ? 'positive' : 'negative'}`}>
                        {latest.expenseGrowth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        Expenses {latest.expenseGrowth >= 0 ? '+' : ''}{latest.expenseGrowth.toFixed(1)}% YoY
                      </span>
                    )}
                    {latest.noiGrowth != null && (
                      <span className={`yoy-chip ${latest.noiGrowth >= 0 ? 'positive' : 'negative'}`}>
                        {latest.noiGrowth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        NOI {latest.noiGrowth >= 0 ? '+' : ''}{latest.noiGrowth.toFixed(1)}% YoY
                      </span>
                    )}
                  </div>
                );
              })()}
            </section>
          )}

          {(forecast.projectedMonthlyIncome > 0 || forecast.projectedMonthlyExpenses > 0) && (
            <section className="card section-card dash-forecast-section" style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ marginBottom: '1rem' }}><Activity size={18} aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-3px' }} />Forecast</h2>
              <div className="metrics-grid">
                <div className="metric-card">
                  <span className="metric-label">Projected Income</span>
                  <span className="metric-value positive">{formatMoney(forecast.projectedMonthlyIncome)}<small>/mo</small></span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Projected Expenses</span>
                  <span className="metric-value negative">{formatMoney(forecast.projectedMonthlyExpenses)}<small>/mo</small></span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Projected NOI</span>
                  <span className={`metric-value ${forecast.projectedMonthlyNOI >= 0 ? 'positive' : 'negative'}`}>
                    {formatMoney(forecast.projectedMonthlyNOI)}<small>/mo</small>
                  </span>
                </div>
                {forecast.actualVsProjectedIncome != null && (
                  <div className="metric-card">
                    <span className="metric-label">Actual vs Projected</span>
                    <span className={`metric-value ${forecast.actualVsProjectedIncome >= 0 ? 'positive' : 'negative'}`}>
                      {forecast.actualVsProjectedIncome >= 0 ? '+' : ''}{forecast.actualVsProjectedIncome.toFixed(1)}%
                    </span>
                    <span className="metric-sub">Income this month</span>
                  </div>
                )}
              </div>
              {forecast.leaseExpirationRisk.length > 0 && (
                <div className="forecast-risk">
                  <div className="forecast-risk-header">
                    <AlertTriangle size={14} aria-hidden="true" />
                    <span>{formatMoney(forecast.rentAtRisk)}/mo rent at risk — {forecast.leaseExpirationRisk.length} lease{forecast.leaseExpirationRisk.length !== 1 ? 's' : ''} expiring within 90 days</span>
                  </div>
                  <div className="forecast-risk-list">
                    {forecast.leaseExpirationRisk.slice(0, 5).map((r) => (
                      <Link key={r.tenant.id} to={`/tenants/${r.tenant.id}`} className="forecast-risk-item">
                        <strong>{r.tenant.name}</strong>
                        <span>{formatMoney(r.monthlyRent)}/mo · {r.daysLeft}d left</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

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
              <div key={`lease-${tenant.id}`} className="dash-notif dash-notif-alert" style={{ display: 'flex', alignItems: 'center' }}>
                <CalendarDays size={16} className="dash-notif-icon" aria-hidden="true" />
                <Link to={`/tenants/${tenant.id}`} className="dash-notif-body" style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}>
                  <strong>{tenant.name}</strong>
                  <span>Lease ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''} · {formatMoney(tenant.monthlyRent)}/mo</span>
                </Link>
                <Link to={`/tenants/${tenant.id}`} className="btn small primary no-print" style={{ marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>
                  Renew Lease
                </Link>
              </div>
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

      {rentReminders.length > 0 && (
        <section className="dash-section" aria-label="Rent reminders">
          <div className="dash-section-header">
            <h2><Mail size={18} aria-hidden="true" /> Rent Reminders</h2>
            <span className="dash-section-count">{rentReminders.length}</span>
          </div>
          <p className="dash-section-desc">Rent is due soon — send reminders to tenants who haven't paid yet.</p>
          <div className="dash-list">
            {rentReminders.map((r) => (
              <div key={`rem-${r.tenant.id}`} className="dash-list-item" style={{ display: 'flex', alignItems: 'center' }}>
                <div className="dash-list-body" style={{ flex: 1 }}>
                  <strong>{r.tenant.name}</strong>
                  <span>{r.property.name} · {formatMoney(r.expectedRent)} · {r.tenant.email}</span>
                </div>
                <a
                  href={`mailto:${r.tenant.email}?subject=${encodeURIComponent(`Rent Reminder — ${r.property.name}`)}&body=${encodeURIComponent(`Hi ${r.tenant.name},\n\nThis is a friendly reminder that your rent of ${formatMoney(r.expectedRent)} is due on the 1st.\n\nThank you,\nManagement`)}`}
                  className="btn small primary no-print"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Mail size={12} /> Send Reminder
                </a>
              </div>
            ))}
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
                <PropertyInvestmentMetrics propertyId={s.property.id} properties={properties} units={units} tenants={tenants} expenses={expenses} payments={payments} year={now.getFullYear()} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  positive,
  tooltip,
  id,
  tooltipId,
  setTooltipId,
}: {
  label: string
  value: string
  positive?: boolean
  tooltip: string
  id: string
  tooltipId: string | null
  setTooltipId: (id: string | null) => void
}) {
  return (
    <div className="metric-card">
      <span className="metric-label">
        {label}
        <button
          type="button"
          className="metric-info-btn"
          aria-label={`Info about ${label}`}
          onClick={() => setTooltipId(tooltipId === id ? null : id)}
        >
          <Info size={12} />
        </button>
      </span>
      <span className={`metric-value ${positive === true ? 'positive' : positive === false ? 'negative' : ''}`}>
        {value}
      </span>
      {tooltipId === id && (
        <span className="metric-tooltip">{tooltip}</span>
      )}
    </div>
  )
}

function PropertyInvestmentMetrics({
  propertyId,
  properties,
  units,
  tenants,
  expenses,
  payments,
  year,
}: {
  propertyId: string
  properties: Property[]
  units: Unit[]
  tenants: Tenant[]
  expenses: Expense[]
  payments: Payment[]
  year: number
}) {
  const m = useMemo(
    () => getInvestmentMetrics(properties, units, tenants, expenses, payments, year, propertyId),
    [properties, units, tenants, expenses, payments, year, propertyId],
  )
  if (m.annualIncome === 0 && m.annualExpenses === 0) return null
  return (
    <div className="dash-prop-invest">
      <div className="dash-prop-metric">
        <span className="dash-prop-metric-label">NOI</span>
        <span className={`dash-prop-metric-value ${m.noi >= 0 ? 'positive' : 'negative'}`}>{formatMoney(m.noi)}</span>
      </div>
      {m.capRate != null && (
        <div className="dash-prop-metric">
          <span className="dash-prop-metric-label">Cap Rate</span>
          <span className="dash-prop-metric-value">{m.capRate.toFixed(1)}%</span>
        </div>
      )}
      {m.expenseRatio != null && (
        <div className="dash-prop-metric">
          <span className="dash-prop-metric-label">Exp. Ratio</span>
          <span className={`dash-prop-metric-value ${m.expenseRatio <= 45 ? 'positive' : 'negative'}`}>{m.expenseRatio.toFixed(0)}%</span>
        </div>
      )}
    </div>
  )
}
