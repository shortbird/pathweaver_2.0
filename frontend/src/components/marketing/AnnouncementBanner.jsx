import React from 'react'
import { Link } from 'react-router-dom'
import { captureEvent } from '../../services/posthog'

const AnnouncementBanner = () => {
  return (
    <Link
      to="/academy"
      onClick={() => captureEvent('marketing_announcement_banner_click')}
      className="fixed top-0 left-0 right-0 z-[60] h-10 flex items-center justify-center bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs sm:text-sm font-semibold hover:opacity-95 transition-opacity px-4"
      style={{ fontFamily: 'Poppins' }}
    >
      <span className="text-center truncate">
        <span className="hidden sm:inline">Applications open for Optio Academy&apos;s 2026 – 27 school year</span>
        <span className="sm:hidden">26 – 27 applications open</span>
        <span className="ml-2 underline underline-offset-2">Apply &rarr;</span>
      </span>
    </Link>
  )
}

export default AnnouncementBanner
