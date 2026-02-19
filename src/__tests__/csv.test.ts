import { describe, it, expect } from 'vitest'
import { toCSV } from '../lib/csv'

describe('toCSV', () => {
  it('generates header + data rows', () => {
    const result = toCSV(['Name', 'Amount'], [['Rent', 1200], ['Repairs', 300]])
    const lines = result.split('\r\n')
    expect(lines[0]).toBe('Name,Amount')
    expect(lines[1]).toBe('Rent,1200')
    expect(lines[2]).toBe('Repairs,300')
  })

  it('escapes commas in values', () => {
    const result = toCSV(['Desc'], [['Hello, world']])
    expect(result).toContain('"Hello, world"')
  })

  it('escapes double quotes', () => {
    const result = toCSV(['Desc'], [['He said "hi"']])
    expect(result).toContain('"He said ""hi"""')
  })

  it('handles undefined values', () => {
    const result = toCSV(['A', 'B'], [[undefined, 'ok']])
    expect(result).toContain(',ok')
  })

  it('handles empty rows', () => {
    const result = toCSV(['A'], [])
    expect(result).toBe('A')
  })
})
