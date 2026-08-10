/**
 * Printable step checklist formatted for an 80mm receipt printer.
 *
 * Opens a print-ready window sized for thermal receipt paper (72mm printable
 * width) so a kiosk with an attached receipt printer can hand a student their
 * AI step breakdown to carry to a work station. Falls back gracefully on a
 * normal printer — the narrow column simply prints on the left of the page.
 *
 * Thermal printers are effectively 1-bit (no grayscale), so the layout relies
 * on size and weight for hierarchy, never on gray text.
 *
 * @param {Object} options
 * @param {string} [options.orgName]     - school display name for the header
 * @param {string} [options.studentName] - student first/display name
 * @param {string} options.taskTitle     - the task being broken down
 * @param {Array}  options.steps         - nested steps [{title, description, is_completed, sub_steps}]
 */

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const renderSteps = (steps, depth = 0) => (steps || []).map(step => `
  <div class="step depth-${Math.min(depth, 2)}">
    <span class="box${step.is_completed ? ' done' : ''}">${step.is_completed ? '&#10003;' : ''}</span>
    <span class="step-body">
      <span class="step-title">${escapeHtml(step.title)}</span>
      ${step.description ? `<span class="step-hint">${escapeHtml(step.description)}</span>` : ''}
    </span>
  </div>
  ${step.sub_steps?.length ? renderSteps(step.sub_steps, depth + 1) : ''}`).join('\n')

export function buildStepsReceiptHtml({ orgName, studentName, taskTitle, steps }) {
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>My steps</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 72mm; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #000; padding: 3mm 2mm;
  }
  .org { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; text-align: center; }
  .date { font-size: 10px; text-align: center; margin-top: 1mm; }
  .rule { border-top: 1px dashed #000; margin: 2.5mm 0; }
  .who { font-size: 13px; font-weight: 700; }
  .task { font-size: 15px; font-weight: 800; line-height: 1.25; margin-top: 1mm; }
  .step { display: flex; align-items: flex-start; gap: 2.5mm; padding: 1.6mm 0; break-inside: avoid; }
  .step.depth-1 { margin-left: 6mm; }
  .step.depth-2 { margin-left: 12mm; }
  .box {
    flex: none; width: 5mm; height: 5mm; border: 2px solid #000; border-radius: 1mm;
    font-size: 12px; font-weight: 800; line-height: 4.2mm; text-align: center; margin-top: 0.4mm;
  }
  .box.done { background: #000; color: #fff; }
  .step-body { display: block; }
  .step-title { display: block; font-size: 13px; font-weight: 700; line-height: 1.3; }
  .step-hint { display: block; font-size: 10px; line-height: 1.35; margin-top: 0.6mm; }
  .footer { font-size: 11px; font-weight: 600; text-align: center; margin-top: 1mm; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>
  ${orgName ? `<div class="org">${escapeHtml(orgName)}</div>` : ''}
  <div class="date">${escapeHtml(dateLine)}</div>
  <div class="rule"></div>
  ${studentName ? `<div class="who">${escapeHtml(studentName)}</div>` : ''}
  <div class="task">${escapeHtml(taskTitle)}</div>
  <div class="rule"></div>
  ${renderSteps(steps)}
  <div class="rule"></div>
  <div class="footer">One step at a time.</div>
  <script>window.onload = function () { window.print(); }</script>
</body>
</html>`
}

export function printStepsReceipt({ orgName, studentName, taskTitle, steps }) {
  if (!steps || steps.length === 0) return false

  const printWindow = window.open('', '_blank', 'width=400,height=700')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(buildStepsReceiptHtml({ orgName, studentName, taskTitle, steps }))
  printWindow.document.close()
  return true
}
