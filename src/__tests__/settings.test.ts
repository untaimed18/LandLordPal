import { describe, it, expect, beforeEach } from 'vitest'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../lib/settings'

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults when nothing is saved', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips saved settings', () => {
    const custom = { ...DEFAULT_SETTINGS, leaseWarningDays: 30 }
    saveSettings(custom)
    expect(loadSettings()).toEqual(custom)
  })

  it('fills missing keys with defaults', () => {
    localStorage.setItem('landlordpal-settings', JSON.stringify({ leaseWarningDays: 45 }))
    const result = loadSettings()
    expect(result.leaseWarningDays).toBe(45)
    expect(result.insuranceWarningDays).toBe(DEFAULT_SETTINGS.insuranceWarningDays)
  })

  it('handles corrupt JSON gracefully', () => {
    localStorage.setItem('landlordpal-settings', 'not-json')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('rejects non-numeric values and uses defaults', () => {
    localStorage.setItem('landlordpal-settings', JSON.stringify({ leaseWarningDays: 'bad' }))
    expect(loadSettings().leaseWarningDays).toBe(DEFAULT_SETTINGS.leaseWarningDays)
  })

  it('includes move-in requirement defaults', () => {
    const s = loadSettings()
    expect(s.requireSecurityDeposit).toBe(true)
    expect(s.requireFirstMonth).toBe(true)
    expect(s.requireLastMonth).toBe(false)
    expect(s.defaultDepositAmount).toBe(0)
  })

  it('loads saved boolean move-in settings', () => {
    saveSettings({ ...DEFAULT_SETTINGS, requireLastMonth: true, defaultDepositAmount: 1500 })
    const s = loadSettings()
    expect(s.requireLastMonth).toBe(true)
    expect(s.defaultDepositAmount).toBe(1500)
  })

  it('uses defaults for missing move-in boolean settings', () => {
    localStorage.setItem('landlordpal-settings', JSON.stringify({ leaseWarningDays: 90 }))
    const s = loadSettings()
    expect(s.requireSecurityDeposit).toBe(true)
    expect(s.requireFirstMonth).toBe(true)
    expect(s.requireLastMonth).toBe(false)
    expect(s.defaultDepositAmount).toBe(0)
  })
})
