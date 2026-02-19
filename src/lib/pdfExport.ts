import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
