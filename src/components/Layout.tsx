import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import {
  LayoutDashboard,
  Banknote,
  Home,
  Receipt,
  Wrench,
  BarChart3,
  CalendarDays,
  Users,
  Settings,
  Search,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const nav: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/rent', label: 'Rent', Icon: Banknote },
  { to: '/properties', label: 'Properties', Icon: Home },
  { to: '/expenses', label: 'Expenses', Icon: Receipt },
  { to: '/maintenance', label: 'Maintenance', Icon: Wrench },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { to: '/vendors', label: 'Vendors', Icon: Users },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

interface SearchResult {
  type: string
  label: string
  sub: string
  to: string
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { properties, units, tenants, vendors, maintenanceRequests } = useStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const results: SearchResult[] = []
  if (searchQuery.trim().length >= 2) {
    const q = searchQuery.toLowerCase()
    for (const p of properties) {
      if (p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q) || p.city.toLowerCase().includes(q)) {
        results.push({ type: 'Property', label: p.name, sub: `${p.address}, ${p.city}`, to: `/properties/${p.id}` })
      }
    }
    for (const u of units) {
      if (u.name.toLowerCase().includes(q)) {
        const prop = properties.find((p) => p.id === u.propertyId)
        results.push({ type: 'Unit', label: u.name, sub: prop?.name ?? '', to: `/properties/${u.propertyId}` })
      }
    }
    for (const t of tenants) {
      if (t.name.toLowerCase().includes(q) || (t.email && t.email.toLowerCase().includes(q)) || (t.phone && t.phone.includes(q))) {
        const prop = properties.find((p) => p.id === t.propertyId)
        results.push({ type: 'Tenant', label: t.name, sub: prop?.name ?? '', to: `/properties/${t.propertyId}` })
      }
    }
    for (const v of vendors) {
      if (v.name.toLowerCase().includes(q) || (v.specialty && v.specialty.toLowerCase().includes(q))) {
        results.push({ type: 'Vendor', label: v.name, sub: v.specialty ?? '', to: '/vendors' })
      }
    }
    for (const m of maintenanceRequests) {
      if (m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)) {
        const prop = properties.find((p) => p.id === m.propertyId)
        results.push({ type: 'Maintenance', label: m.title, sub: prop?.name ?? '', to: '/maintenance' })
      }
    }
  }

  function selectResult(r: SearchResult) {
    setSearchOpen(false)
    setSearchQuery('')
    navigate(r.to)
  }

  return (
    <div className="layout">
      <header className="header">
        <Link to="/" className="logo">
          <Home size={22} />
          <span>LandLord Pal</span>
        </Link>
        <nav className="nav">
          {nav.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className={location.pathname === to || (to !== '/' && location.pathname.startsWith(to)) ? 'active' : ''}
            >
              <Icon size={16} className="nav-icon" />
              {label}
            </Link>
          ))}
        </nav>
        <button type="button" className="search-trigger" onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }} title="Search (Ctrl+K)">
          <Search size={16} />
          <span className="search-hint">Ctrl+K</span>
        </button>
      </header>
      <main className="main">
        {children}
      </main>
      <footer className="footer">
        <span>LandLord Pal</span>
        <span className="footer-sep">·</span>
        <span>Data stored locally in this browser</span>
      </footer>

      {searchOpen && (
        <div className="search-overlay" onClick={() => { setSearchOpen(false); setSearchQuery('') }}>
          <div className="search-modal" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder="Search properties, tenants, vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery.trim().length >= 2 && (
              <div className="search-results">
                {results.length === 0 ? (
                  <div className="search-empty">No results found</div>
                ) : (
                  results.slice(0, 15).map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className="search-result"
                      onClick={() => selectResult(r)}
                    >
                      <span className="search-result-type">{r.type}</span>
                      <span className="search-result-label">{r.label}</span>
                      <span className="search-result-sub muted">{r.sub}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
