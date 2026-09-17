/**
 * Rows to a CSV the office can open in Excel, and the download itself.
 *
 * Four SIS exports each quoted cells, joined lines and built a blob by hand,
 * and one of them forgot the byte-order mark, which is how accented names
 * come out mangled in Excel (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md,
 * K5). One writer.
 */

/** One cell, quoted only when it has to be. */
export const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Header (an array of labels, or null for none) and rows of cell values. */
export const toCsv = (header, rows) => {
  const lines = []
  if (header && header.length) lines.push(header.map(csvCell).join(','))
  for (const row of rows) lines.push(row.map(csvCell).join(','))
  return lines.join('\r\n')
}

/** Save a blob through a transient anchor. */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Save CSV text. The BOM keeps Excel from mangling accented names. */
export const downloadCsv = (text, filename) =>
  downloadBlob(new Blob(['\ufeff', text], { type: 'text/csv;charset=utf-8' }), filename)

/** Today as YYYY-MM-DD, for filenames. */
export const dateStamp = () => new Date().toISOString().slice(0, 10)
