import { describe, it, expect } from 'vitest'
import { processTemplate } from '../lib/email'

describe('processTemplate', () => {
  const data = {
    tenantName: 'Jane Smith',
    unitName: 'Apt 2B',
    propertyName: 'Sunset Apartments',
    rentAmount: '$1,200',
    dueDate: '1st of the month',
  }

  it('replaces all placeholders', () => {
    const template = 'Dear {{tenantName}}, your rent of {{rentAmount}} for {{unitName}} at {{propertyName}} is due on the {{dueDate}}.'
    const result = processTemplate(template, data)
    expect(result).toBe('Dear Jane Smith, your rent of $1,200 for Apt 2B at Sunset Apartments is due on the 1st of the month.')
  })

  it('handles multiple occurrences of the same placeholder', () => {
    const template = '{{tenantName}} — {{tenantName}}'
    const result = processTemplate(template, data)
    expect(result).toBe('Jane Smith — Jane Smith')
  })

  it('leaves unknown placeholders untouched', () => {
    const template = '{{tenantName}} owes {{unknownField}}'
    const result = processTemplate(template, data)
    expect(result).toBe('Jane Smith owes {{unknownField}}')
  })

  it('handles empty template', () => {
    expect(processTemplate('', data)).toBe('')
  })

  it('handles template with no placeholders', () => {
    const template = 'Hello, this is a plain message.'
    expect(processTemplate(template, data)).toBe(template)
  })
})
