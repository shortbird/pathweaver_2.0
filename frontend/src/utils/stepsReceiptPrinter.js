/**
 * Printable step checklist formatted for continuous label tape.
 *
 * Sized for a Brother QL-series printer on 62mm continuous tape (DK-2205,
 * the "2.4 inch" roll), which is what the schools actually have on the desk.
 * Two things matter on this hardware and neither is true of receipt paper:
 *
 *   1. The tape is 62mm but the print head does not reach the edges. Brother
 *      reserves ~1.5mm per side, so LABEL_PRINT_WIDTH_MM is the real canvas.
 *      Laying out to the full 62mm silently shears the right-hand characters
 *      off every line.
 *   2. `@page { size: <w> auto }` does NOT mean "as long as the content" on a
 *      continuous roll — the browser falls back to the driver's paper length
 *      and the printer feeds (and cuts) that whole length, leaving a long
 *      blank tail. So we measure the rendered content and stamp an exact
 *      page height in before calling print().
 *
 * Thermal printers are 1-bit (no grayscale), so hierarchy comes from size and
 * weight, never from gray text.
 *
 * @param {Object} options
 * @param {string} [options.orgName]     - school display name for the header
 * @param {string} [options.studentName] - student first/display name
 * @param {string} options.taskTitle     - the task being broken down
 * @param {Array}  options.steps         - nested steps [{title, description, is_completed, sub_steps}]
 * @param {number} [options.tapeWidthMm] - physical tape width, default 62
 */

// Physical tape width and the margin the QL print head cannot reach.
export const TAPE_WIDTH_MM = 62
const UNPRINTABLE_EDGE_MM = 1.5

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

export function buildStepsReceiptHtml({ orgName, studentName, taskTitle, steps, tapeWidthMm = TAPE_WIDTH_MM }) {
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric'
  })
  const printWidthMm = Math.round((tapeWidthMm - UNPRINTABLE_EDGE_MM * 2) * 10) / 10

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>My steps</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${printWidthMm}mm; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #000; padding: 2mm 1.5mm;
    /* AI step text is unpredictable - a long URL or compound word must wrap,
       not push the column past the edge of the tape. */
    overflow-wrap: anywhere; word-break: break-word;
  }
  .org { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; text-align: center; }
  .date { font-size: 9px; text-align: center; margin-top: 0.5mm; }
  .rule { border-top: 1px dashed #000; margin: 1.8mm 0; }
  .who { font-size: 11px; font-weight: 700; }
  .task { font-size: 13px; font-weight: 800; line-height: 1.2; margin-top: 0.5mm; }
  .step { display: flex; align-items: flex-start; gap: 1.8mm; padding: 1.1mm 0; break-inside: avoid; }
  .step.depth-1 { margin-left: 3.5mm; }
  .step.depth-2 { margin-left: 7mm; }
  .box {
    flex: none; width: 4mm; height: 4mm; border: 1.5px solid #000; border-radius: 0.8mm;
    font-size: 10px; font-weight: 800; line-height: 3.4mm; text-align: center; margin-top: 0.3mm;
  }
  .box.done { background: #000; color: #fff; }
  .step-body { display: block; min-width: 0; }
  .step-title { display: block; font-size: 11px; font-weight: 700; line-height: 1.25; }
  .step-hint { display: block; font-size: 9px; line-height: 1.3; margin-top: 0.4mm; }
  .footer { font-size: 9px; font-weight: 600; text-align: center; margin-top: 0.5mm; }
  @media print {
    @page { size: ${tapeWidthMm}mm auto; margin: 0; }
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
  <script>
    window.onload = function () {
      // "auto" page height feeds the driver's full paper length on a
      // continuous roll. Measure what we actually rendered and pin the page
      // to that, so the label is cut just past the last line.
      var heightMm = Math.ceil(document.body.scrollHeight * 25.4 / 96) + 2;
      var pageStyle = document.createElement('style');
      pageStyle.textContent = '@page { size: ${tapeWidthMm}mm ' + heightMm + 'mm; margin: 0; }';
      document.head.appendChild(pageStyle);
      setTimeout(function () { window.print(); }, 50);
    }
  </script>
</body>
</html>`
}

export function printStepsReceipt({ orgName, studentName, taskTitle, steps, tapeWidthMm }) {
  if (!steps || steps.length === 0) return false

  const printWindow = window.open('', '_blank', 'width=320,height=700')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(buildStepsReceiptHtml({ orgName, studentName, taskTitle, steps, tapeWidthMm }))
  printWindow.document.close()
  return true
}
