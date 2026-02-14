import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { formatMoney, formatDate } from '../lib/format'

interface CalendarEvent {
  date: string
  type: 'rent_due' | 'lease_end' | 'lease_start' | 'maintenance' | 'expense_recurring'
  label: string
  sub: string
  link?: string
  priority?: string
}

const TYPE_LABELS: Record<string, { label: string; icon: string; className: string }> = {
  rent_due: { label: 'Rent due', icon: '💰', className: 'cal-rent' },
  lease_end: { label: 'Lease ends', icon: '📋', className: 'cal-lease-end' },
  lease_start: { label: 'Lease starts', icon: '🔑', className: 'cal-lease-start' },
  maintenance: { label: 'Maintenance', icon: '🔧', className: 'cal-maintenance' },
  expense_recurring: { label: 'Recurring expense', icon: '💸', className: 'cal-expense' },
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const { properties, units, tenants, expenses, maintenanceRequests } = useStore()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const events = useMemo(() => {
    const result: CalendarEvent[] = []
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`

    // Rent due: 1st of the month for each active tenant
    for (const t of tenants) {
      const leaseStart = t.leaseStart
      const leaseEnd = t.leaseEnd
      const mStart = leaseStart.slice(0, 7)
      const mEnd = leaseEnd.slice(0, 7)
      if (monthStr >= mStart && monthStr <= mEnd) {
        const prop = properties.find((p) => p.id === t.propertyId)
        const unit = units.find((u) => u.id === t.unitId)
        result.push({
          date: `${monthStr}-01`,
          type: 'rent_due',
          label: `${t.name} — ${formatMoney(t.monthlyRent)}`,
          sub: `${prop?.name ?? ''} / ${unit?.name ?? ''}`,
          link: `/properties/${t.propertyId}`,
        })
      }
    }

    // Lease endings this month
    for (const t of tenants) {
      if (t.leaseEnd.startsWith(monthStr)) {
        const prop = properties.find((p) => p.id === t.propertyId)
        result.push({
          date: t.leaseEnd,
          type: 'lease_end',
          label: `${t.name}'s lease ends`,
          sub: prop?.name ?? '',
          link: `/properties/${t.propertyId}`,
        })
      }
    }

    // Lease starts this month
    for (const t of tenants) {
      if (t.leaseStart.startsWith(monthStr)) {
        const prop = properties.find((p) => p.id === t.propertyId)
        result.push({
          date: t.leaseStart,
          type: 'lease_start',
          label: `${t.name}'s lease starts`,
          sub: prop?.name ?? '',
          link: `/properties/${t.propertyId}`,
        })
      }
    }

    // Open maintenance requests (show on created date if in this month)
    for (const m of maintenanceRequests) {
      if (m.status !== 'completed' && m.createdAt.startsWith(monthStr)) {
        const prop = properties.find((p) => p.id === m.propertyId)
        result.push({
          date: m.createdAt.slice(0, 10),
          type: 'maintenance',
          label: m.title,
          sub: prop?.name ?? '',
          link: '/maintenance',
          priority: m.priority,
        })
      }
    }

    // Recurring expenses (1st of each month)
    for (const e of expenses) {
      if (e.recurring && e.date.startsWith(monthStr)) {
        const prop = properties.find((p) => p.id === e.propertyId)
        result.push({
          date: e.date,
          type: 'expense_recurring',
          label: `${e.description} — ${formatMoney(e.amount)}`,
          sub: prop?.name ?? '',
          link: '/expenses',
        })
      }
    }

    return result.sort((a, b) => a.date.localeCompare(b.date))
  }, [year, month, tenants, properties, units, expenses, maintenanceRequests])

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const weeks: (number | null)[][] = []
  let week: (number | null)[] = Array(firstDayOfMonth).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  function getEventsForDay(day: number): CalendarEvent[] {
    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter((e) => e.date === dayStr)
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }
  function goToday() {
    setYear(now.getFullYear())
    setMonth(now.getMonth())
  }

  // Upcoming events (next 30 days from today)
  const upcoming = useMemo(() => {
    const result: CalendarEvent[] = []
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + 30)
    const todayISO = today.toISOString().slice(0, 10)
    const cutoffISO = cutoff.toISOString().slice(0, 10)

    for (const t of tenants) {
      if (t.leaseEnd >= todayISO && t.leaseEnd <= cutoffISO) {
        const prop = properties.find((p) => p.id === t.propertyId)
        result.push({
          date: t.leaseEnd,
          type: 'lease_end',
          label: `${t.name}'s lease ends`,
          sub: prop?.name ?? '',
          link: `/properties/${t.propertyId}`,
        })
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date))
  }, [tenants, properties])

  return (
    <div className="page calendar-page">
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="page-desc">Upcoming rent due dates, lease events, and maintenance schedules.</p>
        </div>
      </div>

      <div className="calendar-nav">
        <button type="button" className="btn small" onClick={prevMonth}>&larr; Prev</button>
        <h2 className="calendar-title">{MONTH_NAMES[month]} {year}</h2>
        <button type="button" className="btn small" onClick={nextMonth}>Next &rarr;</button>
        <button type="button" className="btn small" onClick={goToday}>Today</button>
      </div>

      <div className="calendar-grid">
        {DAY_NAMES.map((d) => (
          <div key={d} className="cal-header">{d}</div>
        ))}
        {weeks.flat().map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="cal-cell empty" />
          const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = getEventsForDay(day)
          const isToday = dayStr === todayStr
          return (
            <div key={i} className={`cal-cell ${isToday ? 'today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}`}>
              <span className="cal-day-number">{day}</span>
              <div className="cal-events">
                {dayEvents.slice(0, 3).map((ev, j) => {
                  const meta = TYPE_LABELS[ev.type]
                  return (
                    <div key={j} className={`cal-event ${meta.className}`} title={`${ev.label} — ${ev.sub}`}>
                      <span className="cal-event-icon">{meta.icon}</span>
                      <span className="cal-event-text">{ev.label.length > 20 ? ev.label.slice(0, 20) + '…' : ev.label}</span>
                    </div>
                  )
                })}
                {dayEvents.length > 3 && (
                  <div className="cal-event cal-more">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Event list for the month */}
      {events.length > 0 && (
        <section className="card section-card" style={{ marginTop: '1.5rem' }}>
          <h2>Events — {MONTH_NAMES[month]} {year}</h2>
          <div className="calendar-event-list">
            {events.map((ev, i) => {
              const meta = TYPE_LABELS[ev.type]
              return (
                <div key={i} className={`calendar-event-item ${meta.className}`}>
                  <span className="cal-event-date">{formatDate(ev.date)}</span>
                  <span className="cal-event-icon">{meta.icon}</span>
                  <span className="cal-event-type badge small">{meta.label}</span>
                  <span className="cal-event-label">{ev.label}</span>
                  <span className="cal-event-sub muted">{ev.sub}</span>
                  {ev.link && <Link to={ev.link} className="btn small">View</Link>}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {events.length === 0 && (
        <div className="empty-state-card card" style={{ maxWidth: 480, margin: '2rem auto' }}>
          <div className="empty-icon">📅</div>
          <p className="empty-state-title">No events this month</p>
          <p className="empty-state-text">Events like rent due dates, lease expirations, and maintenance will show up here.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="card section-card" style={{ marginTop: '1.5rem' }}>
          <h2>Upcoming in next 30 days</h2>
          <div className="calendar-event-list">
            {upcoming.map((ev, i) => {
              const meta = TYPE_LABELS[ev.type]
              return (
                <div key={i} className={`calendar-event-item ${meta.className}`}>
                  <span className="cal-event-date">{formatDate(ev.date)}</span>
                  <span className="cal-event-icon">{meta.icon}</span>
                  <span className="cal-event-type badge small">{meta.label}</span>
                  <span className="cal-event-label">{ev.label}</span>
                  <span className="cal-event-sub muted">{ev.sub}</span>
                  {ev.link && <Link to={ev.link} className="btn small">View</Link>}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
