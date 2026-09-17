/**
 * Printing from the SIS, one way.
 *
 * `printElement(target)` prints one part of the current page: the elements
 * matching `target` (a selector, an id, or an element) become the print area
 * and everything else is hidden, through the one `@media print` block in
 * index.css (`body.sis-printing`). Anything inside the area marked `no-print`
 * stays off the paper -- buttons, pickers, the modal's own chrome. Five pages
 * used to carry their own copy of that stylesheet, and one (the substitute
 * sheet) referenced a class no stylesheet defined, so it printed the whole
 * app behind the modal (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, K5).
 *
 * `printHtml(title, bodyHtml)` prints a document built from scratch, in its
 * own window, for a sheet that is not on screen at all (a class's progress
 * grid).
 */

const PRINTING = 'sis-printing'
const AREA = 'sis-print-area'

const resolve = (target) => {
  if (!target) return []
  if (typeof target !== 'string') return [target]
  if (/^[A-Za-z][\w-]*$/.test(target)) {
    const byId = document.getElementById(target)
    return byId ? [byId] : []
  }
  return [...document.querySelectorAll(target)]
}

export const printElement = (target) => {
  const els = resolve(target)
  if (!els.length) return
  els.forEach((el) => el.classList.add(AREA))
  document.body.classList.add(PRINTING)
  const cleanup = () => {
    els.forEach((el) => el.classList.remove(AREA))
    document.body.classList.remove(PRINTING)
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  try {
    window.print()
  } catch {
    cleanup() // jsdom has no print
  }
}

const SHEET_CSS = `
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 24px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  p { color: #6b7280; font-size: 12px; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 16px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: center; }
  th { background: #f9fafb; text-align: center; }
  td.name, th:first-child { text-align: left; }
`

export const printHtml = (title, bodyHtml) => {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>${SHEET_CSS}</style></head><body>${bodyHtml}</body></html>`)
  w.document.close()
  w.print()
}
