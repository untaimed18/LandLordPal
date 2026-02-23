import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { MaintenanceRequest, Property, Unit, Vendor, Tenant } from '../types'

const BRAND_COLOR: [number, number, number] = [59, 130, 246]

interface PdfTableOptions {
  title: string
  subtitle?: string
  headers: string[]
  rows: (string | number)[][]
  filename: string
  totals?: (string | number)[]
}

export function exportTablePdf({ title, subtitle, headers, rows, filename, totals }: PdfTableOptions) {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.setTextColor(...BRAND_COLOR)
  doc.text(title, 14, 20)

  if (subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(120, 120, 120)
    doc.text(subtitle, 14, 27)
  }

  const bodyRows = rows.map((row) => row.map(String))
  if (totals) {
    bodyRows.push(totals.map(String))
  }

  autoTable(doc, {
    head: [headers],
    body: bodyRows,
    startY: subtitle ? 32 : 26,
    headStyles: {
      fillColor: BRAND_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didParseCell(data) {
      if (totals && data.section === 'body' && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [230, 235, 245]
      }
    },
    margin: { left: 14, right: 14 },
  })

  doc.setFontSize(7)
  doc.setTextColor(160, 160, 160)
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.text(`LandLord Pal — Generated ${new Date().toLocaleDateString()}`, 14, pageHeight - 8)

  doc.save(filename)
}

export function formatMoneyForPdf(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

interface TenantStatementOptions {
  tenantName: string
  propertyName: string
  unitName: string
  monthlyRent: number
  leaseStart: string
  leaseEnd: string
  transactions: { date: string; description: string; charge: number; payment: number; balance: number }[]
  filename: string
}

export function exportTenantStatementPdf(opts: TenantStatementOptions) {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.setTextColor(...BRAND_COLOR)
  doc.text('Tenant Statement', 14, 20)

  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  doc.text(opts.tenantName, 14, 28)
  doc.text(`${opts.propertyName} — ${opts.unitName}`, 14, 34)
  doc.text(`Lease: ${opts.leaseStart} to ${opts.leaseEnd}  ·  Rent: ${formatMoneyForPdf(opts.monthlyRent)}/mo`, 14, 40)

  const rows = opts.transactions.map((t) => [
    t.date,
    t.description,
    t.charge > 0 ? formatMoneyForPdf(t.charge) : '',
    t.payment > 0 ? formatMoneyForPdf(t.payment) : '',
    formatMoneyForPdf(t.balance),
  ])

  const finalBalance = opts.transactions.length > 0 ? opts.transactions[opts.transactions.length - 1].balance : 0

  autoTable(doc, {
    head: [['Date', 'Description', 'Charges', 'Payments', 'Balance']],
    body: rows,
    startY: 46,
    headStyles: { fillColor: BRAND_COLOR, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  })

  const finalY = ((doc as unknown as Record<string, unknown>).lastAutoTable as Record<string, number> | undefined)?.finalY ?? 200
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text(`Balance Due: ${formatMoneyForPdf(finalBalance)}`, 14, finalY + 10)

  doc.setFontSize(7)
  doc.setTextColor(160, 160, 160)
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.text(`LandLord Pal — Generated ${new Date().toLocaleDateString()}`, 14, pageHeight - 8)

  doc.save(opts.filename)
}

// ─── Work Order PDF ──────────────────────────────────────────────────────────

interface WorkOrderOptions {
  request: MaintenanceRequest
  property: Property
  unit?: Unit
  vendor?: Vendor
  tenant?: Tenant
}

const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', emergency: 'Emergency' }
const CATEGORY_LABELS: Record<string, string> = { plumbing: 'Plumbing', electrical: 'Electrical', hvac: 'HVAC', appliance: 'Appliance', structural: 'Structural', pest: 'Pest Control', other: 'Other' }

export function exportWorkOrderPdf({ request, property, unit, vendor, tenant }: WorkOrderOptions) {
  const doc = new jsPDF()
  const pw = doc.internal.pageSize.getWidth()

  doc.setFontSize(20)
  doc.setTextColor(...BRAND_COLOR)
  doc.text('WORK ORDER', 14, 20)

  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(`WO-${request.id.slice(0, 8).toUpperCase()}`, 14, 27)
  doc.text(`Generated ${new Date().toLocaleDateString()}`, pw - 14, 20, { align: 'right' })

  doc.setDrawColor(200, 200, 200)
  doc.line(14, 30, pw - 14, 30)

  let y = 38

  const section = (label: string) => {
    doc.setFontSize(11)
    doc.setTextColor(...BRAND_COLOR)
    doc.text(label, 14, y)
    y += 6
  }

  const row = (label: string, value: string) => {
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(label, 14, y)
    doc.setTextColor(30, 30, 30)
    doc.text(value, 60, y)
    y += 5
  }

  section('Property')
  row('Name:', property.name)
  row('Address:', `${property.address}, ${property.city}, ${property.state} ${property.zip}`)
  if (unit) row('Unit:', unit.name)
  y += 3

  if (vendor) {
    section('Vendor / Contractor')
    row('Name:', vendor.name)
    if (vendor.phone) row('Phone:', vendor.phone)
    if (vendor.email) row('Email:', vendor.email)
    if (vendor.specialty) row('Specialty:', vendor.specialty)
    y += 3
  }

  if (tenant) {
    section('Reported By')
    row('Tenant:', tenant.name)
    if (tenant.phone) row('Phone:', tenant.phone)
    if (tenant.email) row('Email:', tenant.email)
    y += 3
  }

  section('Work Details')
  row('Title:', request.title)
  row('Category:', CATEGORY_LABELS[request.category] ?? request.category)
  row('Priority:', PRIORITY_LABELS[request.priority] ?? request.priority)
  row('Status:', request.status.replace('_', ' '))
  if (request.scheduledDate) row('Scheduled:', request.scheduledDate)
  if (request.cost) row('Est. Cost:', formatMoneyForPdf(request.cost))
  if (request.actualCost != null) row('Actual Cost:', formatMoneyForPdf(request.actualCost))
  y += 3

  section('Description')
  doc.setFontSize(9)
  doc.setTextColor(30, 30, 30)
  const descLines = doc.splitTextToSize(request.description, pw - 28)
  doc.text(descLines, 14, y)
  y += descLines.length * 4.5 + 5

  if (request.notes) {
    section('Internal Notes')
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    const noteLines = doc.splitTextToSize(request.notes, pw - 28)
    doc.text(noteLines, 14, y)
    y += noteLines.length * 4.5 + 5
  }

  y = Math.max(y + 10, 220)

  doc.setDrawColor(200, 200, 200)
  doc.line(14, y, pw / 2 - 10, y)
  doc.line(pw / 2 + 10, y, pw - 14, y)
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('Vendor Signature', 14, y + 5)
  doc.text('Landlord Signature', pw / 2 + 10, y + 5)
  doc.text('Date: _______________', 14, y + 12)
  doc.text('Date: _______________', pw / 2 + 10, y + 12)

  doc.setFontSize(7)
  doc.setTextColor(160, 160, 160)
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.text('LandLord Pal — Work Order', 14, pageHeight - 8)

  doc.save(`work-order-${request.id.slice(0, 8)}.pdf`)
}
