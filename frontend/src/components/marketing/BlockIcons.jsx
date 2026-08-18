import React from 'react'

/**
 * Line icons for the "building blocks" grid on the For Schools page.
 *
 * Built from simple geometry at a uniform 24x24 / 1.5 stroke so the whole grid
 * reads as one set. Icons repeat across categories but never within one, since
 * a category is what a reader scans at a glance.
 */
const PATHS = {
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  book: (
    <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  ),
  layers: (
    <>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
      <path d="M3.5 12.5l8.5 4.5 8.5-4.5" />
      <path d="M3.5 16.5l8.5 4 8.5-4" />
    </>
  ),
  chart: (
    <>
      <path d="M5.5 19.5V11" />
      <path d="M12 19.5V4.5" />
      <path d="M18.5 19.5v-6" />
      <path d="M3.5 19.5h17" />
    </>
  ),
  notebook: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 3.5v17" />
      <path d="M12.5 8.5h3.5" />
      <path d="M12.5 12h3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4 17.5l4.5-4.5 3 3 3.5-3.5L20 17" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10.5 5.5h3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.2-3.1 7.9-7.5 9.5-4.4-1.6-7.5-5.3-7.5-9.5V6z" />
      <path d="M9 12l2.2 2.2 4.3-4.4" />
    </>
  ),
  exchange: (
    <>
      <path d="M4 9h13l-3.5-3.5" />
      <path d="M20 15H7l3.5 3.5" />
    </>
  ),
  hourglass: (
    <>
      <path d="M7 3.5h10" />
      <path d="M7 20.5h10" />
      <path d="M7 3.5v3.2l5 5.3 5-5.3V3.5" />
      <path d="M7 20.5v-3.2l5-5.3 5 5.3v3.2" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5v-1a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M9 12.5l2 2 4-4.5" />
    </>
  ),
  docText: (
    <>
      <path d="M6 3.5h7l5 5v12a1 1 0 01-1 1H6a1 1 0 01-1-1v-16a1 1 0 011-1z" />
      <path d="M13 3.5V9h5" />
      <path d="M8.5 13h7" />
      <path d="M8.5 16.5h5" />
    </>
  ),
  chat: (
    <>
      <path d="M4 6.5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 3.5V16.5H6a2 2 0 01-2-2z" />
      <path d="M9 10.5h.01" />
      <path d="M12 10.5h.01" />
      <path d="M15 10.5h.01" />
    </>
  ),
  bulb: (
    <>
      <path d="M12 3.5a5.5 5.5 0 00-3.2 10 2.5 2.5 0 01.9 1.8v.2h4.6v-.2c0-.7.3-1.4.9-1.8A5.5 5.5 0 0012 3.5z" />
      <path d="M9.7 18.5h4.6" />
      <path d="M10.5 21h3" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 3.5l1.5 4L16.5 9l-4 1.5-1.5 4-1.5-4L5.5 9l4-1.5z" />
      <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4" />
      <path d="M8 7.5L12 4l4 3.5" />
      <path d="M4.5 15v3.5a2 2 0 002 2h11a2 2 0 002-2V15" />
    </>
  ),
  checklist: (
    <>
      <path d="M4 7l1.5 1.5L8.5 5.5" />
      <path d="M4 15.5L5.5 17l3-3" />
      <path d="M11.5 7.5h8.5" />
      <path d="M11.5 15.5h8.5" />
    </>
  ),
  calGrid: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3.5v4" />
      <path d="M16 3.5v4" />
      <path d="M8.5 13.5h3" />
      <path d="M14 13.5h2.5" />
      <path d="M8.5 17h3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.1 2.4-5.2 5.5-5.2s5.5 2.1 5.5 5.2" />
      <path d="M16 5.5a3 3 0 010 5.6" />
      <path d="M17.5 15c1.9.7 3 2.4 3 4.4" />
    </>
  ),
  idcard: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16c.6-1.3 1.7-2 3-2s2.4.7 3 2" />
      <path d="M14.5 10.5h4" />
      <path d="M14.5 14h4" />
    </>
  ),
  form: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.9-5.4 6.5-5.4" />
      <path d="M17 13.5v6" />
      <path d="M14 16.5h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3.5v4" />
      <path d="M16 3.5v4" />
    </>
  ),
  map: (
    <>
      <path d="M9 4.5L3.5 7v12.5L9 17l6 2.5 5.5-2.5V4.5L15 7z" />
      <path d="M9 4.5V17" />
      <path d="M15 7v12.5" />
    </>
  ),
  code: (
    <>
      <path d="M9 8l-4 4 4 4" />
      <path d="M15 8l4 4-4 4" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M9.5 9.5v10" />
      <path d="M15 9.5v10" />
    </>
  ),
  checkSquare: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  bell: (
    <>
      <path d="M12 3.5A5.5 5.5 0 006.5 9c0 5-2 6.5-2 6.5h15s-2-1.5-2-6.5A5.5 5.5 0 0012 3.5z" />
      <path d="M10.4 19a1.8 1.8 0 003.2 0" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" />
      <path d="M3.5 13.5L6 5.7A2 2 0 018 4.3h8a2 2 0 011.9 1.4l2.6 7.8v4.3a2 2 0 01-2 2H5.5a2 2 0 01-2-2z" />
    </>
  ),
  layout: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M10 9.5v10" />
    </>
  ),
  speech: (
    <>
      <path d="M3.5 5.5A1.5 1.5 0 015 4h9a1.5 1.5 0 011.5 1.5v5A1.5 1.5 0 0114 12H8.5L5.5 14.5V12H5a1.5 1.5 0 01-1.5-1.5z" />
      <path d="M18.5 8.5h.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5h-.5v2.5L15 16.5h-2" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M6 12h.01" />
      <path d="M18 12h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5v-3a3.5 3.5 0 017 0v3" />
      <path d="M12 14.5v2" />
    </>
  ),
  tablet: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <circle cx="12" cy="18" r="1" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3.5 10a1.5 1.5 0 011.5-1.5h2l7-4v15l-7-4H5A1.5 1.5 0 013.5 14z" />
      <path d="M17.5 9a4 4 0 010 6" />
      <path d="M7 14.5v4" />
    </>
  ),
  bulletin: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M12 2.5V5" />
      <path d="M7.5 10h9" />
      <path d="M7.5 14h5.5" />
    </>
  ),
  addressBook: (
    <>
      <rect x="5.5" y="3" width="13" height="18" rx="2" />
      <path d="M3 8h2.5" />
      <path d="M3 12h2.5" />
      <path d="M3 16h2.5" />
      <circle cx="12" cy="10" r="2" />
      <path d="M9 16c.5-1.5 1.7-2.4 3-2.4s2.5.9 3 2.4" />
    </>
  ),
  envelope: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7.5l8.5 6 8.5-6" />
    </>
  ),
  cap: (
    <>
      <path d="M3 9l9-4 9 4-9 4z" />
      <path d="M7 11v4.2c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11" />
    </>
  ),
  chartDoc: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8.5 16v-3.5" />
      <path d="M12 16V9" />
      <path d="M15.5 16v-2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
}

const BlockIcon = ({ name, className = 'w-5 h-5' }) => {
  const paths = PATHS[name]
  if (!paths) return null

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}

export default BlockIcon
