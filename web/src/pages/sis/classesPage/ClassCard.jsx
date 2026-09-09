/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import Chip from './Chip'

const ClassCard = ({ c, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col text-left hover:border-optio-purple/50 hover:shadow-md transition-all"
  >
    <div className="relative h-40 w-full bg-gradient-to-br from-optio-purple/10 to-optio-pink/10">
      {c.image_url ? (
        <img src={c.image_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-optio-purple/30">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
        </div>
      )}
      <span className="absolute top-2 right-2"><Chip className="bg-white/90 text-optio-purple">Class</Chip></span>
      {c.is_full && <span className="absolute top-2 left-2"><Chip className="bg-red-500 text-white">Full</Chip></span>}
    </div>

    <div className="p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-neutral-900">{c.name}</h3>
        {c.registration_status !== 'open' && c.status !== 'archived' && (
          <Chip className="bg-amber-100 text-amber-700">Closed</Chip>
        )}
      </div>
      {c.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{c.description}</p>}
    </div>
  </button>
)

// The card body opens the course's SIS settings/enrollments; "View" opens the
// course in the real student view so staff can review it or demo it.

export default ClassCard
