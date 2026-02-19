import { describe, it, expect } from 'vitest'
import { formatMoney, formatDate, formatMonthYear, formatPct, formatPhoneNumber, isValidZip } from '../lib/format'

describe('formatMoney', () => {
  it('formats positive amounts', () => {
    expect(formatMoney(1234)).toBe('$1,234')
  })
  it('formats zero', () => {
    expect(formatMoney(0)).toBe('$0')
  })
  it('handles NaN gracefully', () => {
    expect(formatMoney(NaN)).toBe('$0')
  })
  it('supports decimal places', () => {
    expect(formatMoney(1234.56, 2)).toBe('$1,234.56')
  })
  it('formats negative amounts', () => {
    expect(formatMoney(-500)).toBe('-$500')
  })
})

describe('formatDate', () => {
  it('formats ISO date strings', () => {
    const result = formatDate('2025-06-15')
    expect(result).toContain('Jun')
    expect(result).toContain('15')
    expect(result).toContain('2025')
  })
  it('returns dash for empty string', () => {
    expect(formatDate('')).toBe('—')
  })
  it('returns original for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})

describe('formatMonthYear', () => {
  it('formats month and year', () => {
    const result = formatMonthYear('2025-06-01')
    expect(result).toContain('June')
    expect(result).toContain('2025')
  })
})

describe('formatPct', () => {
  it('formats to one decimal', () => {
    expect(formatPct(95.678)).toBe('95.7%')
  })
  it('formats zero', () => {
    expect(formatPct(0)).toBe('0.0%')
  })
})

describe('formatPhoneNumber', () => {
  it('formats 10 digits', () => {
    expect(formatPhoneNumber('5551234567')).toBe('(555) 123-4567')
  })
  it('formats partial input (3 digits)', () => {
    expect(formatPhoneNumber('555')).toBe('555')
  })
  it('formats partial input (6 digits)', () => {
    expect(formatPhoneNumber('555123')).toBe('(555) 123')
  })
  it('strips non-digits', () => {
    expect(formatPhoneNumber('(555) 123-4567')).toBe('(555) 123-4567')
  })
  it('limits to 10 digits', () => {
    expect(formatPhoneNumber('55512345678900')).toBe('(555) 123-4567')
  })
})

describe('isValidZip', () => {
  it('accepts 5-digit ZIP', () => {
    expect(isValidZip('78701')).toBe(true)
  })
  it('accepts ZIP+4', () => {
    expect(isValidZip('78701-1234')).toBe(true)
  })
  it('rejects short ZIP', () => {
    expect(isValidZip('7870')).toBe(false)
  })
  it('rejects letters', () => {
    expect(isValidZip('ABCDE')).toBe(false)
  })
})
