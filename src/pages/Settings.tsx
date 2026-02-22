import { useRef, useState, useEffect } from 'react'
import { useStore } from '../hooks/useStore'
import { getState, importState, addProperty, addUnit, addTenant, updateUnit, addExpense, addPayment, addEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from '../store'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { nowISO } from '../lib/id'
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type AppSettings } from '../lib/settings'
import { backupSchema } from '../lib/schemas'
import { parseImportCSV, type ImportType } from '../lib/csvImport'
import { Home, DoorOpen, User, DollarSign, Receipt, Wrench, Users, FileText, Sun, Moon, MessageSquare, Bell, Paperclip, Download, RefreshCw, Upload, Mail, ShieldCheck } from 'lucide-react'
import { toCSV, downloadCSV } from '../lib/csv'

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
  const { properties, units, tenants, expenses, payments, maintenanceRequests, activityLogs, vendors, communicationLogs, documents, emailTemplates } = useStore()
  const fileInput = useRef<HTMLInputElement>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme)
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadSettings())
  const [importType, setImportType] = useState<ImportType>('properties')
  const [templateForm, setTemplateForm] = useState<{ id?: string; name: string; subject: string; body: string } | null>(null)

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
        const raw = JSON.parse(reader.result as string)
        const parsed = backupSchema.safeParse(raw)
        if (!parsed.success) {
          const issues = parsed.error.issues.slice(0, 3).map((i) => i.message).join('; ')
          toast(`Invalid backup file: ${issues}`, 'error')
          return
        }
        const recordCount = Object.values(parsed.data).reduce((s, arr) => s + arr.length, 0)
        const ok = await confirm({
          title: 'Import backup',
          message: `Importing will replace ALL current data with ${recordCount} records from the backup. This cannot be undone.`,
          confirmText: 'Import',
          danger: true,
        })
        if (!ok) return
        importState(parsed.data as Record<string, unknown>)
        toast('Backup restored successfully')
      } catch {
        toast('Invalid backup file. Please select a valid LandLord Pal backup.', 'error')
      }
    }
    reader.readAsText(file)
    if (fileInput.current) fileInput.current.value = ''
  }

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const text = reader.result as string
      const result = parseImportCSV(importType, text, properties, units, tenants)
      
      if (result.errors.length > 0) {
        toast(`Import failed: ${result.errors[0]}`, 'error')
        return
      }

      const count = result.properties.length + result.units.length + result.tenants.length + result.expenses.length + result.payments.length
      if (count === 0) { toast('No valid records found in CSV', 'error'); return }

      const ok = await confirm({
        title: `Import ${count} ${importType}?`,
        message: `Found ${count} records. Ready to import?`,
        confirmText: 'Import',
      })
      if (!ok) return

      try {
        if (importType === 'properties') {
          for (const p of result.properties) await addProperty(p)
        } else if (importType === 'units') {
          for (const u of result.units) await addUnit(u)
        } else if (importType === 'tenants') {
          for (const t of result.tenants) {
            await addTenant(t)
            await updateUnit(t.unitId, { available: false })
          }
        } else if (importType === 'expenses') {
          for (const ex of result.expenses) await addExpense(ex)
        } else if (importType === 'payments') {
          for (const p of result.payments) await addPayment(p)
        }
        toast(`Successfully imported ${count} ${importType}`)
      } catch {
        toast('Import failed partway through', 'error')
      }
    }
    reader.readAsText(file)
    if (csvInput.current) csvInput.current.value = ''
  }

  function downloadTemplate(type: ImportType) {
    const templates: Record<ImportType, string[]> = {
      properties: ['Name', 'Address', 'City', 'State', 'ZIP', 'Notes'],
      units: ['Property', 'Name', 'Rent', 'Bedrooms', 'Bathrooms', 'Notes'],
      tenants: ['Property', 'Unit', 'Name', 'Rent', 'Lease Start', 'Lease End', 'Deposit', 'Email', 'Phone'],
      expenses: ['Property', 'Unit', 'Date', 'Amount', 'Category', 'Description', 'Recurring'],
      payments: ['Tenant', 'Property', 'Date', 'Amount', 'Method', 'Period Start', 'Period End', 'Notes', 'Late Fee'],
    }
    downloadCSV(`${type}-template.csv`, toCSV(templates[type], []))
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!templateForm) return
    try {
      if (templateForm.id) {
        await updateEmailTemplate(templateForm.id, { name: templateForm.name, subject: templateForm.subject, body: templateForm.body })
        toast('Template updated')
      } else {
        await addEmailTemplate({ name: templateForm.name, subject: templateForm.subject, body: templateForm.body })
        toast('Template created')
      }
      setTemplateForm(null)
    } catch {
      toast('Failed to save template', 'error')
    }
  }

  async function handleDeleteTemplate(id: string) {
    const ok = await confirm({ title: 'Delete template', message: 'Are you sure?', confirmText: 'Delete', danger: true })
    if (!ok) return
    try {
      await deleteEmailTemplate(id)
      toast('Template deleted')
    } catch {
      toast('Failed to delete template', 'error')
    }
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
    importState({ properties: [], units: [], tenants: [], expenses: [], payments: [], maintenanceRequests: [], activityLogs: [], vendors: [], communicationLogs: [], documents: [], emailTemplates: [] })
    toast('All data cleared')
  }

  const [updateChecking, setUpdateChecking] = useState(false)

  async function handleCheckForUpdates() {
    if (!window.electronAPI?.checkForUpdates) return
    setUpdateChecking(true)
    try {
      await window.electronAPI.checkForUpdates()
      toast('Checking for updates…', 'info')
    } catch {
      toast('Could not check for updates', 'error')
    } finally {
      setTimeout(() => setUpdateChecking(false), 3000)
    }
  }

  const totalRecords = properties.length + units.length + tenants.length + expenses.length + payments.length + maintenanceRequests.length + activityLogs.length + vendors.length + communicationLogs.length + documents.length

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
        <h2><Upload size={18} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} /> Bulk Import</h2>
        <p className="section-desc">Import data from CSV files. Please use the templates provided to ensure correct formatting.</p>
        
        <div className="import-controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <select value={importType} onChange={(e) => setImportType(e.target.value as any)} className="select-inline">
            <option value="properties">Properties</option>
            <option value="units">Units</option>
            <option value="tenants">Tenants</option>
            <option value="expenses">Expenses</option>
            <option value="payments">Payments</option>
          </select>
          <button type="button" className="btn small" onClick={() => downloadTemplate(importType)}>Download Template</button>
        </div>

        <label className="btn primary">
          Select CSV File
          <input
            ref={csvInput}
            type="file"
            accept=".csv"
            onChange={handleCsvImport}
            style={{ display: 'none' }}
          />
        </label>
      </section>

      <section className="card section-card">
        <div className="section-card-header">
          <h2><Mail size={18} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} /> Email Templates</h2>
          <button type="button" className="btn small" onClick={() => setTemplateForm({ name: '', subject: '', body: '' })}>+ New Template</button>
        </div>
        
        {templateForm && (
          <form className="form-card" onSubmit={handleSaveTemplate} style={{ marginBottom: '1.5rem', border: '1px solid var(--border)', padding: '1rem', borderRadius: 'var(--radius)' }}>
            <h3>{templateForm.id ? 'Edit Template' : 'New Template'}</h3>
            <div className="form-grid">
              <label>Template Name <input required value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="e.g. Rent Reminder" /></label>
              <label>Subject Line <input required value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} placeholder="Email subject..." /></label>
            </div>
            <label>
              Body
              <textarea
                required
                rows={5}
                value={templateForm.body}
                onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                placeholder="Hello {{tenantName}}, ..."
              />
              <span className="field-hint">Available variables: {'{{tenantName}}'}, {'{{unitName}}'}, {'{{propertyName}}'}, {'{{rentAmount}}'}, {'{{dueDate}}'}</span>
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary">Save</button>
              <button type="button" className="btn" onClick={() => setTemplateForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="template-list">
          {emailTemplates.length === 0 ? (
            <p className="empty-state">No templates yet.</p>
          ) : (
            emailTemplates.map((t) => (
              <div key={t.id} className="template-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <strong>{t.name}</strong>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>{t.subject}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn small" onClick={() => setTemplateForm(t)}>Edit</button>
                  <button type="button" className="btn small danger" onClick={() => handleDeleteTemplate(t.id)}>Delete</button>
                </div>
              </div>
            ))
          )}
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
          <div className="threshold-item">
            <div className="threshold-header">
              <span className="threshold-label">Rent reminder window</span>
              <div className="threshold-input-wrap">
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={appSettings.rentReminderDays}
                  onChange={(e) => handleSettingChange('rentReminderDays', Math.max(0, +e.target.value || 0))}
                  aria-label="Rent reminder days"
                />
                <span className="threshold-unit">days</span>
              </div>
            </div>
            <span className="threshold-desc">
              Show rent reminders on the dashboard this many days before the 1st (default: {DEFAULT_SETTINGS.rentReminderDays}). Set to 0 to disable.
            </span>
          </div>
        </div>
        <button type="button" className="btn small" onClick={handleResetSettings} style={{ marginTop: '0.5rem' }}>
          Reset to defaults
        </button>
      </section>

      <section className="card section-card">
        <div className="section-card-header">
          <h2><ShieldCheck size={18} aria-hidden="true" /> Move-in requirements</h2>
        </div>
        <p className="section-desc">Default requirements for new tenants. These can be overridden per-tenant when adding them.</p>
        <div className="settings-thresholds">
          <div className="threshold-item">
            <label className={`toggle-card${appSettings.requireSecurityDeposit ? ' active' : ''}`}>
              <input type="checkbox" checked={appSettings.requireSecurityDeposit} onChange={(e) => handleSettingChange('requireSecurityDeposit', e.target.checked)} />
              <span className="toggle-card-text">
                <span className="toggle-card-label">Require security deposit</span>
                <span className="toggle-card-desc">Collect a security deposit before move-in</span>
              </span>
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
          </div>
          {appSettings.requireSecurityDeposit && (
            <div className="threshold-item">
              <div className="threshold-header">
                <span className="threshold-label">Default deposit amount</span>
                <div className="threshold-input-wrap">
                  <span className="threshold-unit">$</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={appSettings.defaultDepositAmount}
                    onChange={(e) => handleSettingChange('defaultDepositAmount', Math.max(0, +e.target.value || 0))}
                    aria-label="Default deposit amount"
                  />
                </div>
              </div>
              <span className="threshold-desc">Set to $0 to default to one month's rent for each unit.</span>
            </div>
          )}
          <div className="threshold-item">
            <label className={`toggle-card${appSettings.requireFirstMonth ? ' active' : ''}`}>
              <input type="checkbox" checked={appSettings.requireFirstMonth} onChange={(e) => handleSettingChange('requireFirstMonth', e.target.checked)} />
              <span className="toggle-card-text">
                <span className="toggle-card-label">Require first month's rent</span>
                <span className="toggle-card-desc">First month's rent due at move-in</span>
              </span>
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
          </div>
          <div className="threshold-item">
            <label className={`toggle-card${appSettings.requireLastMonth ? ' active' : ''}`}>
              <input type="checkbox" checked={appSettings.requireLastMonth} onChange={(e) => handleSettingChange('requireLastMonth', e.target.checked)} />
              <span className="toggle-card-text">
                <span className="toggle-card-label">Require last month's rent</span>
                <span className="toggle-card-desc">Collect last month's rent upfront before move-in</span>
              </span>
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
          </div>
        </div>
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
          <div className="data-summary-item"><Paperclip size={16} className="data-summary-icon" aria-hidden="true" /><span className="data-summary-count">{documents.length}</span><span className="data-summary-label">Documents</span></div>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>{totalRecords} total records</p>
      </section>

      <section className="card section-card">
        <h2><Download size={18} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Export individual tables (CSV)</h2>
        <p className="section-desc">Download any table as a CSV file for spreadsheets or tax preparation.</p>
        <div className="settings-actions" style={{ flexWrap: 'wrap' }}>
          {properties.length > 0 && <button type="button" className="btn small" onClick={() => {
            downloadCSV(`properties-${nowISO()}.csv`, toCSV(
              ['Name', 'Address', 'City', 'State', 'ZIP', 'Type', 'SqFt', 'Purchase Price', 'Purchase Date'],
              properties.map((p) => [p.name, p.address, p.city, p.state, p.zip, p.propertyType ?? '', p.sqft ?? '', p.purchasePrice ?? '', p.purchaseDate ?? ''])
            )); toast('Properties exported', 'info')
          }}>Properties ({properties.length})</button>}
          {units.length > 0 && <button type="button" className="btn small" onClick={() => {
            downloadCSV(`units-${nowISO()}.csv`, toCSV(
              ['Property', 'Name', 'Beds', 'Baths', 'SqFt', 'Rent', 'Deposit', 'Available'],
              units.map((u) => [properties.find((p) => p.id === u.propertyId)?.name ?? '', u.name, u.bedrooms, u.bathrooms, u.sqft ?? '', u.monthlyRent, u.deposit ?? '', u.available ? 'Yes' : 'No'])
            )); toast('Units exported', 'info')
          }}>Units ({units.length})</button>}
          {tenants.length > 0 && <button type="button" className="btn small" onClick={() => {
            downloadCSV(`tenants-${nowISO()}.csv`, toCSV(
              ['Name', 'Email', 'Phone', 'Property', 'Unit', 'Lease Start', 'Lease End', 'Rent', 'Deposit', 'Autopay'],
              tenants.map((t) => [t.name, t.email ?? '', t.phone ?? '', properties.find((p) => p.id === t.propertyId)?.name ?? '', units.find((u) => u.id === t.unitId)?.name ?? '', t.leaseStart, t.leaseEnd, t.monthlyRent, t.deposit ?? '', t.autopay ? 'Yes' : 'No'])
            )); toast('Tenants exported', 'info')
          }}>Tenants ({tenants.length})</button>}
          {payments.length > 0 && <button type="button" className="btn small" onClick={() => {
            downloadCSV(`payments-${nowISO()}.csv`, toCSV(
              ['Date', 'Tenant', 'Property', 'Amount', 'Method', 'Period Start', 'Period End', 'Notes'],
              payments.map((p) => [p.date, tenants.find((t) => t.id === p.tenantId)?.name ?? '', properties.find((pr) => pr.id === p.propertyId)?.name ?? '', p.amount, p.method ?? '', p.periodStart, p.periodEnd, p.notes ?? ''])
            )); toast('Payments exported', 'info')
          }}>Payments ({payments.length})</button>}
          {expenses.length > 0 && <button type="button" className="btn small" onClick={() => {
            downloadCSV(`expenses-${nowISO()}.csv`, toCSV(
              ['Date', 'Property', 'Category', 'Description', 'Amount', 'Recurring'],
              expenses.map((e) => [e.date, properties.find((p) => p.id === e.propertyId)?.name ?? '', e.category, e.description, e.amount, e.recurring ? 'Yes' : 'No'])
            )); toast('Expenses exported', 'info')
          }}>Expenses ({expenses.length})</button>}
          {maintenanceRequests.length > 0 && <button type="button" className="btn small" onClick={() => {
            downloadCSV(`maintenance-${nowISO()}.csv`, toCSV(
              ['Title', 'Property', 'Priority', 'Status', 'Category', 'Cost', 'Scheduled', 'Created'],
              maintenanceRequests.map((m) => [m.title, properties.find((p) => p.id === m.propertyId)?.name ?? '', m.priority, m.status, m.category, m.cost ?? '', m.scheduledDate ?? '', m.createdAt.slice(0, 10)])
            )); toast('Maintenance exported', 'info')
          }}>Maintenance ({maintenanceRequests.length})</button>}
          {vendors.length > 0 && <button type="button" className="btn small" onClick={() => {
            downloadCSV(`vendors-${nowISO()}.csv`, toCSV(
              ['Name', 'Phone', 'Email', 'Specialty', 'Notes'],
              vendors.map((v) => [v.name, v.phone ?? '', v.email ?? '', v.specialty ?? '', v.notes ?? ''])
            )); toast('Vendors exported', 'info')
          }}>Vendors ({vendors.length})</button>}
        </div>
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
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          LandLord Pal v{APP_VERSION} · Property management for landlords
        </p>
        <button
          type="button"
          className="btn small"
          onClick={handleCheckForUpdates}
          disabled={updateChecking}
        >
          <RefreshCw size={14} className={updateChecking ? 'spin' : ''} aria-hidden="true" style={{ marginRight: 6 }} />
          {updateChecking ? 'Checking…' : 'Check for updates'}
        </button>
      </section>
    </div>
  )
}
