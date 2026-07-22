/**
 * Printable login cards for no-email (username + password) student accounts.
 *
 * Opens a print-ready window with one card per student (name, username,
 * password, school login URL and QR). Called right after bulk account
 * creation — passwords are only available at that moment.
 *
 * @param {Object} options
 * @param {Array}  options.credentials - [{name, username, password}]
 * @param {string} options.loginUrl    - absolute school login URL
 * @param {string} options.orgName     - school display name
 * @param {string} [options.qrSvg]     - serialized SVG markup for the login QR
 */
export function printCredentialCards({ credentials, loginUrl, orgName, qrSvg }) {
  const rows = (credentials || []).filter(c => c && c.username && c.password)
  if (rows.length === 0) return false

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const cardsHtml = rows.map(c => `
    <div class="card">
      <div class="card-header">${escapeHtml(orgName)}</div>
      <div class="student-name">${escapeHtml(c.name)}</div>
      <div class="field"><span class="label">Username</span><span class="value">${escapeHtml(c.username)}</span></div>
      <div class="field"><span class="label">Password</span><span class="value">${escapeHtml(c.password)}</span></div>
      <div class="footer">
        <div class="url">${escapeHtml(loginUrl)}</div>
        ${qrSvg ? `<div class="qr">${qrSvg}</div>` : ''}
      </div>
    </div>`).join('\n')

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Login cards - ${escapeHtml(orgName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; }
  .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .card {
    border: 2px dashed #9ca3af; border-radius: 12px; padding: 16px;
    break-inside: avoid; page-break-inside: avoid;
  }
  .card-header { font-size: 11px; font-weight: 600; color: #6D469B; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .student-name { font-size: 18px; font-weight: 700; margin-bottom: 10px; }
  .field { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 10px; background: #f9fafb; border-radius: 6px; margin-bottom: 6px; }
  .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .value { font-family: 'Courier New', monospace; font-size: 16px; font-weight: 700; }
  .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; gap: 8px; }
  .url { font-size: 11px; color: #374151; word-break: break-all; }
  .qr svg { width: 64px; height: 64px; display: block; }
  @media print {
    body { padding: 0; }
    @page { margin: 1cm; }
  }
</style>
</head>
<body>
  <div class="sheet">${cardsHtml}</div>
  <script>window.onload = function () { window.print(); }</script>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  return true
}
