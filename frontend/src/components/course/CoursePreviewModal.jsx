import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline'
import CourseHomepage from '../../pages/courses/CourseHomepage'

/**
 * CoursePreviewModal - opens a course in the real student view for school staff.
 *
 * This is deliberately NOT a second rendering of the course: it mounts the same
 * CourseHomepage component students land on from the web platform's "View"
 * button, so what an org admin reviews is exactly what their students get --
 * same projects, lessons, lesson player and tasks.
 *
 * It runs in `preview` mode: the enrollment controls are replaced by a "Student
 * view" chip and the student write actions (completing tasks, uploading
 * evidence, creating tasks, lesson progress) are disabled, so reviewing or
 * demoing a course never enrolls the admin or leaves progress on their account.
 *
 * "Present" drops the modal chrome for showing the course on a screen.
 */
const CoursePreviewModal = ({ courseId, onClose }) => {
  const [presenting, setPresenting] = useState(false)

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [handleKeyDown])

  return createPortal(
    <div className={`fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center ${presenting ? '' : 'md:p-4'}`}>
      <div
        className={
          presenting
            ? 'bg-white w-full h-full flex flex-col overflow-hidden'
            : 'bg-white w-full h-full md:rounded-2xl md:w-[95vw] md:h-[95vh] flex flex-col overflow-hidden shadow-2xl'
        }
      >
        {/* Preview chrome. Everything below it is the student view, untouched. */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2.5 text-white">
          <p className="text-sm font-medium truncate">
            Student view - this is exactly what your students see. Nothing here is saved.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setPresenting(!presenting)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors text-sm font-medium"
              title={presenting ? 'Exit present mode' : 'Present to students'}
            >
              {presenting ? (
                <ArrowsPointingInIcon className="w-4 h-4" />
              ) : (
                <ArrowsPointingOutIcon className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{presenting ? 'Exit present' : 'Present'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close preview"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <CourseHomepage courseId={courseId} preview onClose={onClose} />
        </div>
      </div>
    </div>,
    document.body
  )
}

export default CoursePreviewModal
