import React, { useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { LinkIcon, CheckIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'

/**
 * SchoolLoginLinkCard - Shows the org's login URL with copy button and QR code.
 *
 * The login URL (/login/<slug>) is where org members with username accounts
 * sign in. Schools can print the QR for classroom posters and welcome packets.
 */
export default function SchoolLoginLinkCard({ slug }) {
  const [copied, setCopied] = useState(false)
  const qrRef = useRef(null)

  if (!slug) return null

  const loginUrl = `${window.location.origin}/login/${slug}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (e.g. non-secure context); select-and-copy fallback
      window.prompt('Copy your school login link:', loginUrl)
    }
  }

  const handleDownloadQR = () => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${slug}-login-qr.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-2">School Login Link</h2>
      <p className="text-gray-600 mb-4 text-sm">
        Students with username accounts sign in here. Share the link in welcome
        emails, or print the QR code for classroom posters.
      </p>

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm truncate">
              {loginUrl}
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              {copied ? <CheckIcon className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={handleDownloadQR}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Download QR code
          </button>
        </div>

        <div ref={qrRef} className="p-3 bg-white border border-gray-200 rounded-lg">
          <QRCodeSVG
            value={loginUrl}
            size={120}
            level="H"
            includeMargin
            fgColor="#6D469B"
            bgColor="#FFFFFF"
          />
        </div>
      </div>
    </div>
  )
}
