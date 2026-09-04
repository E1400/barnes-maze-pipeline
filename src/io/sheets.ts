/**
 * File-writing half of export: turns the tidy rows from `exportRows.ts`
 * into an actual CSV or XLSX download via SheetJS. No logic of its own
 * worth unit-testing -- it's a thin wrapper over SheetJS plus a Blob
 * download, verified directly in the browser instead.
 */

import * as XLSX from 'xlsx'
import type { InvestigationRow, QualityRow, TrialRow } from './exportRows.ts'

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadTrialsCsv(rows: readonly TrialRow[], filename: string): void {
  const sheet = XLSX.utils.json_to_sheet(rows as unknown as Record<string, unknown>[])
  triggerDownload(new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: 'text/csv' }), filename)
}

export function downloadInvestigationsCsv(rows: readonly InvestigationRow[], filename: string): void {
  const sheet = XLSX.utils.json_to_sheet(rows as unknown as Record<string, unknown>[])
  triggerDownload(new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: 'text/csv' }), filename)
}

export function downloadQualityCsv(rows: readonly QualityRow[], filename: string): void {
  const sheet = XLSX.utils.json_to_sheet(rows as unknown as Record<string, unknown>[])
  triggerDownload(new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: 'text/csv' }), filename)
}

export function downloadWorkbook(
  trialRows: readonly TrialRow[],
  investigationRows: readonly InvestigationRow[],
  qualityRows: readonly QualityRow[],
  filename: string,
): void {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(trialRows as unknown as Record<string, unknown>[]), 'Trials')
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(investigationRows as unknown as Record<string, unknown>[]),
    'Investigations',
  )
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(qualityRows as unknown as Record<string, unknown>[]), 'Quality')
  XLSX.writeFile(workbook, filename)
}
