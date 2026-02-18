import { useRef, useState, useEffect } from 'react'
import { useStore } from '../hooks/useStore'
import { getState, importState } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { nowISO } from '../lib/id'
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type AppSettings } from '../lib/settings'
import { Home, DoorOpen, User, DollarSign, Receipt, Wrench, Users, FileText, Sun, Moon, MessageSquare, Bell } from 'lucide-react'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'

function getTheme(): 'light' | 'dark' {
  return (localStorage.getItem('landlordpal-theme') as 'light' | 'dark') || 'light'
}

function setThemeClass(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('landlordpal-theme', theme)
}

export default function Settings() {
  const toast = useToast()
  const confirm = useConfirm()
  const { properties, units, tenants, expenses, payments, maintenanceRequests, activityLogs, vendors, communicationLogs } = useStore()
  const fileInput = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme)
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadSettings())

  useEffect(() => {
    setThemeClass(theme)
  }, [theme])

  function handleSettingChange<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const next = { ...appSettings, [key]: value }
    setAppSettings(next)
    saveSettings(next)
    toast('Setting updated', 'info')
  }

  function handleResetSettings() {
    setAppSettings({ ...DEFAULT_SETTINGS })
    saveSettings({ ...DEFAULT_SETTINGS })
    toast('Settings reset to defaults', 'info')
  }

  function handleExport() {
    const data = getState()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `landlordpal-backup-${nowISO()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast('Backup exported', 'info')
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string)
        if (!data || typeof data !== 'object') throw new Error('Invalid data')
        const ok = await confirm({
          title: 'Import backup',
          message: 'Importing a backup will replace ALL current data. This cannot be undone.',
          confirmText: 'Import',
          danger: true,
        })
        if (!ok) return
        importState(data)
        toast('Backup restored successfully')
      } catch {
        toast('Invalid backup file. Please select a valid LandLord Pal backup.', 'error')
      }
    }
    reader.readAsText(file)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function handleClearData() {
    const ok1 = await confirm({
      title: 'Delete all data',
      message: 'This will permanently delete ALL properties, units, tenants, expenses, payments, maintenance requests, notes, and vendors.',
      confirmText: 'Yes, delete everything',
      danger: true,
    })
    if (!ok1) return
    const ok2 = await confirm({
      title: 'Final confirmation',
      message: 'This is your last chance. All data will be gone forever. Continue?',
      confirmText: 'Delete forever',
      danger: true,
    })
    if (!ok2) return
    importState({ properties: [], units: [], tenants: [], expenses: [], payments: [], maintenanceRequests: [], activityLogs: [], vendors: [], communicationLogs: [] })
    toast('All data cleared')
  }

  const totalRecords = properties.length + units.length + tenants.length + expenses.length + payments.length + maintenanceRequests.length + activityLogs.length + vendors.length + communicationLogs.length

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-desc">Manage your data and app preferences.</p>
        </div>
      </div>

      <section className="card section-card">
        <h2>Appearance</h2>
        <p className="section-desc">Choose your preferred theme.</p>
        <div className="theme-toggle" role="radiogroup" aria-label="Theme selection">
          <button
            type="button"
            className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
            role="radio"
            aria-checked={theme === 'light'}
          >
            <Sun size={14} aria-hidden="true" /> Light
          </button>
          <button
            type="button"
            className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
            role="radio"
            aria-checked={theme === 'dark'}
          >
            <Moon size={14} aria-hidden="true" /> Dark
          </button>
        </div>
      </section>

      <section className="card section-card">
        <div className="section-card-header">
          <h2><Bell size={18} aria-hidden="true" /> Notification thresholds</h2>
        </div>
        <p className="section-desc">Configure when alerts and reminders appear on the dashboard.</p>
        <div className="settings-thresholds">
          <div className="threshold-item">
            <div className="threshold-header">
              <span className="threshold-label">Lease expiration warning</span>
              <div className="threshold-input-wrap">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={appSettings.leaseWarningDays}
                  onChange={(e) => handleSettingChange('leaseWarningDays', Math.max(1, +e.target.value || DEFAULT_SETTINGS.leaseWarningDays))}
                  aria-label="Lease expiration warning days"
                />
                <span className="threshold-unit">days</span>
              </div>
            </div>
            <span className="threshold-desc">
              Alert when a lease expires within this window (default: {DEFAULT_SETTINGS.leaseWarningDays})
            </span>
          </div>
          <div className="threshold-item">
            <div className="threshold-header">
              <span className="threshold-label">Insurance expiration warning</span>
              <div className="threshold-input-wrap">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={appSettings.insuranceWarningDays}
                  onChange={(e) => handleSettingChange('insuranceWarningDays', Math.max(1, +e.target.value || DEFAULT_SETTINGS.insuranceWarningDays))}
                  aria-label="Insurance expiration warning days"
                />
                <span className="threshold-unit">days</span>
              </div>
            </div>
            <span className="threshold-desc">
              Alert when insurance expires within this window (default: {DEFAULT_SETTINGS.insuranceWarningDays})
            </span>
          </div>
          <div className="threshold-item">
            <div className="threshold-header">
              <span className="threshold-label">Maintenance lookahead</span>
              <div className="threshold-input-wrap">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={appSettings.maintenanceLookaheadDays}
                  onChange={(e) => handleSettingChange('maintenanceLookaheadDays', Math.max(1, +e.target.value || DEFAULT_SETTINGS.maintenanceLookaheadDays))}
                  aria-label="Maintenance lookahead days"
                />
                <span className="threshold-unit">days</span>
              </div>
            </div>
            <span className="threshold-desc">
              Show upcoming scheduled maintenance within this window (default: {DEFAULT_SETTINGS.maintenanceLookaheadDays})
            </span>
          </div>
          <div className="threshold-item">
            <div className="threshold-header">
              <span className="threshold-label">Default rent grace period</span>
              <div className="threshold-input-wrap">
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={appSettings.defaultGracePeriodDays}
                  onChange={(e) => handleSettingChange('defaultGracePeriodDays', Math.max(0, +e.target.value || 0))}
                  aria-label="Default grace period days"
                />
                <span className="threshold-unit">days</span>
              </div>
            </div>
            <span className="threshold-desc">
              Days after due date before rent is flagged late, when not set per-tenant (default: {DEFAULT_SETTINGS.defaultGracePeriodDays})
            </span>
          </div>
        </div>
        <button type="button" className="btn small" onClick={handleResetSettings} style={{ marginTop: '0.5rem' }}>
          Reset to defaults
        </button>
      </section>

      <section className="card section-card">
        <h2>Data summary</h2>
        <div className="data-summary-grid">
          <div className="data-summary-item"><Home size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{properties.length}</span><span className="data-summary-label">Properties</span></div>
          <div className="data-summary-item"><DoorOpen size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{units.length}</span><span className="data-summary-label">Units</span></div>
          <div className="data-summary-item"><User size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{tenants.length}</span><span className="data-summary-label">Tenants</span></div>
          <div className="data-summary-item"><DollarSign size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{payments.length}</span><span className="data-summary-label">Payments</span></div>
          <div className="data-summary-item"><Receipt size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{expenses.length}</span><span className="data-summary-label">Expenses</span></div>
          <div className="data-summary-item"><Wrench size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{maintenanceRequests.length}</span><span className="data-summary-label">Maintenance</span></div>
          <div className="data-summary-item"><Users size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{vendors.length}</span><span className="data-summary-label">Vendors</span></div>
          <div className="data-summary-item"><FileText size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{activityLogs.length}</span><span className="data-summary-label">Notes</span></div>
          <div className="data-summary-item"><MessageSquare size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{communicationLogs.length}</span><span className="data-summary-label">Communications</span></div>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>{totalRecords} total records</p>
      </section>

      <section className="card section-card">
        <h2>Backup & restore</h2>
        <p className="section-desc">
          Your data is stored locally on this device. Export a backup to keep your data safe, or restore from a previous backup.
        </p>
        <div className="settings-actions">
          <button type="button" className="btn primary" onClick={handleExport}>
            Export backup (JSON)
          </button>
          <div>
            <label className="btn" style={{ cursor: 'pointer' }}>
              Import backup
              <input
                ref={fileInput}
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
                aria-label="Import backup file"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="card section-card danger-zone" aria-label="Danger zone">
        <h2>Danger zone</h2>
        <p className="section-desc">
          Permanently delete all data. This cannot be undone. Export a backup first.
        </p>
        <button type="button" className="btn danger" onClick={handleClearData}>
          Delete all data
        </button>
      </section>

      <section className="card section-card" style={{ marginTop: '1.5rem' }}>
        <h2>About</h2>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          LandLord Pal v{APP_VERSION} · Property management for landlords
        </p>
      </section>
    </div>
  )
}
