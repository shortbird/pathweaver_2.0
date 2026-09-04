/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import { Squares2X2Icon, TableCellsIcon, ArrowPathIcon, ArrowDownTrayIcon, EyeIcon } from '@heroicons/react/24/outline'
import OPTIO_COURSE_FEE from './OPTIO_COURSE_FEE'
import Chip from './Chip'

const CourseCard = ({ c, onOpen, onView }) => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:border-optio-purple/50 hover:shadow-md transition-all">
    <button type="button" onClick={onOpen} className="text-left flex-1">
      <div className="relative h-40 w-full bg-gradient-to-br from-optio-pink/10 to-optio-purple/10">
        {c.cover_image_url ? (
          <img src={c.cover_image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-optio-pink/30">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
        <span className="absolute top-2 right-2"><Chip className="bg-white/90 text-optio-pink">Course</Chip></span>
      </div>

      <div className="px-4 pt-4">
        <h3 className="font-semibold text-neutral-900">{c.title}</h3>
        {c.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-3">{c.description}</p>}
        <p className="mt-2 text-xs font-medium text-optio-purple">{OPTIO_COURSE_FEE} per student · billed to the school</p>
      </div>
    </button>

    <div className="px-4 pb-4 pt-3">
      <button
        type="button"
        onClick={onView}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-optio-purple/10 text-optio-purple text-sm font-medium hover:bg-optio-purple/20 transition-colors min-h-[44px]"
      >
        <EyeIcon className="w-5 h-5" />
        View
      </button>
    </div>
  </div>
)

export default CourseCard
