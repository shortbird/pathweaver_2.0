/**
 * Printable step checklist formatted for continuous label tape.
 *
 * Sized for a Brother QL-series printer on 62mm continuous tape (DK-2205,
 * the "2.4 inch" roll), which is what the schools actually have on the desk.
 * Three things matter on this hardware and none of them is true of paper:
 *
 *   1. The tape is 62mm but the print head does not reach the edges, and the
 *      roll drifts a little on the spindle. Brother reserves ~1.5mm per side;
 *      SAFE_EDGE_MM is deliberately larger than that so a wandering roll costs
 *      whitespace instead of the last letter of a line. Everything is laid out
 *      inside a page-width box with symmetric padding, so the text column sits
 *      centered in the tape rather than hugging one edge.
 *   2. `@page { size: <w> auto }` does NOT mean "as long as the content" on a
 *      continuous roll - the browser falls back to the driver's paper length
 *      and the printer feeds (and cuts) that whole length, leaving a long
 *      blank tail. So we measure the rendered label and stamp an exact page
 *      height in before calling print().
 *   3. Browser print headers/footers defeat (2) on their own: with them on,
 *      the browser ignores the pinned page box, prints its own date/URL line
 *      at the bottom of a full sheet, and the roll feeds that whole sheet.
 *      CSS cannot switch them off, so the print window carries an on-screen
 *      reminder to uncheck them.
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

// Physical tape width, and the inset the content keeps from both edges.
export const TAPE_WIDTH_MM = 62
const SAFE_EDGE_MM = 3

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
  const textWidthMm = Math.round((tapeWidthMm - SAFE_EDGE_MM * 2) * 10) / 10

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>My steps</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${tapeWidthMm}mm; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #000;
    /* AI step text is unpredictable - a long URL or compound word must wrap,
       not push the column past the edge of the tape. */
    overflow-wrap: anywhere; word-break: break-word;
  }
  /* The label itself. Padded symmetrically so the text column is centered on
     the tape with SAFE_EDGE_MM of slack on each side. */
  .label { width: ${tapeWidthMm}mm; padding: 2mm ${SAFE_EDGE_MM}mm; }
  .org { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; text-align: center; }
  .date { font-size: 9px; text-align: center; margin-top: 0.5mm; }
  .rule { border-top: 1px dashed #000; margin: 1.8mm 0; }
  .who { font-size: 11px; font-weight: 700; }
  .task { font-size: 13px; font-weight: 800; line-height: 1.2; margin-top: 0.5mm; }
  .step { display: flex; align-items: flex-start; gap: 1.5mm; padding: 1.1mm 0; break-inside: avoid; }
  .step.depth-1 { padding-left: 3mm; }
  .step.depth-2 { padding-left: 6mm; }
  .box {
    flex: 0 0 auto; width: 4mm; height: 4mm; border: 1.5px solid #000; border-radius: 0.8mm;
    font-size: 10px; font-weight: 800; line-height: 3.4mm; text-align: center; margin-top: 0.3mm;
  }
  .box.done { background: #000; color: #fff; }
  /* Must be allowed to shrink below its longest word, or a single long token
     pushes the row wider than the tape and the tail of the line is sheared. */
  .step-body { display: block; flex: 1 1 auto; min-width: 0; }
  .step-title { display: block; font-size: 11px; font-weight: 700; line-height: 1.25; }
  .step-hint { display: block; font-size: 9px; line-height: 1.3; margin-top: 0.4mm; }
  .footer { font-size: 9px; font-weight: 600; text-align: center; margin-top: 0.5mm; }
  .setup {
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 12px; line-height: 1.45; color: #111;
    border: 1px solid #999; border-radius: 4px; padding: 10px 12px; margin: 10px;
    width: calc(100% - 20px);
  }
  .setup b { display: block; margin-bottom: 4px; }
  @media print {
    .setup { display: none; }
    @page { size: ${tapeWidthMm}mm auto; margin: 0; }
  }
</style>
</head>
<body>
  <div class="setup">
    <b>Before you print</b>
    Turn OFF "Headers and footers" in the print dialog. Left on, the browser
    stamps its own date line at the bottom of a full-length sheet and the tape
    feeds that whole length. Paper should be the ${tapeWidthMm}mm continuous roll.
  </div>
  <div class="label" id="label">
    ${orgName ? `<div class="org">${escapeHtml(orgName)}</div>` : ''}
    <div class="date">${escapeHtml(dateLine)}</div>
    <div class="rule"></div>
    ${studentName ? `<div class="who">${escapeHtml(studentName)}</div>` : ''}
    <div class="task">${escapeHtml(taskTitle)}</div>
    <div class="rule"></div>
    ${renderSteps(steps)}
    <div class="rule"></div>
    <div class="footer">One step at a time.</div>
  </div>
  <script>
    window.onload = function () {
      // "auto" page height feeds the driver's full paper length on a
      // continuous roll. Measure the label only - the setup note above it is
      // screen-only, so counting it would pad the tape by its height - and pin
      // the page to that, so the label is cut just past the last line.
      var label = document.getElementById('label');
      var heightPx = label.getBoundingClientRect().height;
      var heightMm = Math.ceil(heightPx * 25.4 / 96) + 1;
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
