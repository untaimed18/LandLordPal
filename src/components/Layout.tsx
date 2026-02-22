import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../hooks/useStore'
import { useToast } from '../context/ToastContext'
import { loadSettings } from '../lib/settings'
import { takeSnapshot, restoreSnapshot, type AppState } from '../store'
import UpdateNotification from './UpdateNotification'
import SaveIndicator from './SaveIndicator'
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
  Bell,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getLeasesEndingSoon } from '../lib/calculations'

const navItems: { to: string; label: string; Icon: LucideIcon }[] = [
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

const MAX_UNDO = 20

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { properties, units, tenants, vendors, maintenanceRequests } = useStore()
  const settings = loadSettings()

  const undoStack = useRef<AppState[]>([])
  const redoStack = useRef<AppState[]>([])

  const pushSnapshot = useCallback(() => {
    const snap = takeSnapshot()
    undoStack.current.push(snap)
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
    redoStack.current = []
  }, [])

  useEffect(() => {
    const handler = () => pushSnapshot()
    window.addEventListener('landlordpal:save-success', handler)
    return () => window.removeEventListener('landlordpal:save-success', handler)
  }, [pushSnapshot])

  const handleUndo = useCallback(async () => {
    if (undoStack.current.length < 2) { toast('Nothing to undo', 'info'); return }
    const current = undoStack.current.pop()!
    redoStack.current.push(current)
    const prev = undoStack.current[undoStack.current.length - 1]
    try {
      await restoreSnapshot(prev)
      toast('Undone')
    } catch {
      undoStack.current.push(current)
      redoStack.current.pop()
      toast('Undo failed', 'error')
    }
  }, [toast])

  const handleRedo = useCallback(async () => {
    if (redoStack.current.length === 0) { toast('Nothing to redo', 'info'); return }
    const next = redoStack.current.pop()!
    undoStack.current.push(next)
    try {
      await restoreSnapshot(next)
      toast('Redone')
    } catch {
      undoStack.current.pop()
      redoStack.current.push(next)
      toast('Redo failed', 'error')
    }
  }, [toast])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

  useEffect(() => {
    const saveHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail
      toast(`Failed to save data: ${detail.message}`, 'error')
    }
    const encHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail
      toast(
        `Warning: Encryption key could not be loaded (${detail.message}). Sensitive data (emails, phone numbers) is being stored without encryption. Please restart the app to resolve this.`,
        'error',
      )
    }
    window.addEventListener('landlordpal:save-error', saveHandler)
    window.addEventListener('landlordpal:encryption-warning', encHandler)
    return () => {
      window.removeEventListener('landlordpal:save-error', saveHandler)
      window.removeEventListener('landlordpal:encryption-warning', encHandler)
    }
  }, [toast])

  const notificationCount = (() => {
    const now = new Date()
    let count = 0
    count += getLeasesEndingSoon(tenants, settings.leaseWarningDays).length
    count += properties.filter((p) => {
      if (!p.insuranceExpiry) return false
      const daysLeft = Math.ceil((new Date(p.insuranceExpiry + 'T12:00:00').getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return daysLeft >= 0 && daysLeft <= settings.insuranceWarningDays
    }).length
    count += maintenanceRequests.filter((r) => {
      if (!r.scheduledDate || r.status === 'completed') return false
      const daysUntil = Math.ceil((new Date(r.scheduledDate + 'T12:00:00').getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return daysUntil >= 0 && daysUntil <= settings.maintenanceLookaheadDays
    }).length
    return count
  })()

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
        setShowShortcuts(false)
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault()
        setShowShortcuts((v) => !v)
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
      <a href="#main-content" className="skip-to-content">Skip to main content</a>
      <header className="header" role="banner">
        <Link to="/" className="logo" aria-label="LandLord Pal home">
          <Home size={22} aria-hidden="true" />
          <span>LandLord Pal</span>
        </Link>
        <nav className="nav" aria-label="Main navigation">
          {navItems.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className={location.pathname === to || (to !== '/' && location.pathname.startsWith(to)) ? 'active' : ''}
              aria-current={location.pathname === to ? 'page' : undefined}
            >
              <Icon size={16} className="nav-icon" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions-right">
          {notificationCount > 0 && (
            <Link to="/" className="notification-bell" aria-label={`${notificationCount} reminder${notificationCount !== 1 ? 's' : ''}`}>
              <Bell size={18} aria-hidden="true" />
              <span className="notification-badge" aria-hidden="true">{notificationCount > 9 ? '9+' : notificationCount}</span>
            </Link>
          )}
          <button
            type="button"
            className="search-trigger"
            onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
            aria-label="Search (Ctrl+K)"
          >
            <Search size={16} aria-hidden="true" />
            <span className="search-hint" aria-hidden="true">Ctrl+K</span>
          </button>
        </div>
      </header>
      <main className="main" role="main" id="main-content">
        {children}
      </main>
      <UpdateNotification />
      <SaveIndicator />
      <footer className="footer" role="contentinfo">
        <span>LandLord Pal</span>
        <span className="footer-sep" aria-hidden="true">·</span>
        <span>All data stored securely on this device</span>
      </footer>

      {searchOpen && (
        <div
          className="search-overlay"
          onClick={() => { setSearchOpen(false); setSearchQuery('') }}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <div className="search-modal" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder="Search properties, tenants, vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              aria-label="Search properties, tenants, vendors"
            />
            {searchQuery.trim().length >= 2 && (
              <div className="search-results" role="listbox" aria-label="Search results">
                {results.length === 0 ? (
                  <div className="search-empty" role="option" aria-selected={false}>No results found</div>
                ) : (
                  results.slice(0, 15).map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className="search-result"
                      onClick={() => selectResult(r)}
                      role="option"
                      aria-selected={false}
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

      {showShortcuts && (
        <div className="search-overlay" onClick={() => setShowShortcuts(false)} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <div className="search-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, padding: '1.5rem' }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Keyboard Shortcuts</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.75rem 1.5rem', alignItems: 'center' }}>
              <kbd className="shortcut-key">Ctrl+K</kbd><span>Search</span>
              <kbd className="shortcut-key">Ctrl+Z</kbd><span>Undo</span>
              <kbd className="shortcut-key">Ctrl+Y</kbd><span>Redo</span>
              <kbd className="shortcut-key">Ctrl+Shift+Z</kbd><span>Redo (alt)</span>
              <kbd className="shortcut-key">?</kbd><span>Toggle this panel</span>
              <kbd className="shortcut-key">Escape</kbd><span>Close modals / panels</span>
            </div>
            <button type="button" className="btn small" onClick={() => setShowShortcuts(false)} style={{ marginTop: '1.25rem' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
