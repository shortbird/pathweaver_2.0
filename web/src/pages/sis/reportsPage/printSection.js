/**
 * Extracted from sis/ReportsPage.jsx -- moved verbatim, only the address
 * changed. Shared by the page and by BlockRosters, which is now its own file.
 */

// Print one section of a report on its own, siblings hidden.
const printSection = (id) => {
  const el = document.getElementById(id)
  if (!el) return
  el.classList.add('sis-day-printing')
  document.body.classList.add('printing-one-day')
  const cleanup = () => {
    el.classList.remove('sis-day-printing')
    document.body.classList.remove('printing-one-day')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}

export default printSection
