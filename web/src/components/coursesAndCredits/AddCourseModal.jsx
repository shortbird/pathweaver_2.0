import React, { useEffect, useState } from 'react'
import { arrayOf, bool, func, number, shape, string } from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { BookOpenIcon } from '@heroicons/react/24/outline'
import { Modal } from '../ui/Modal'
import { Spinner } from '../ui/Spinner'
import api from '../../services/api'
import { creditsToXp, xpWithCredits } from './xpLabels'

// An Optio quest is Optio's own, so it carries the brand mark (as the
// sidebar's Custom Class item does), not a generic icon.
const OptioMark = () => (
  <img
    src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg"
    alt=""
    className="w-5 h-5 object-contain"
  />
)

// The form's examples, in the subject being added to: "Saxon Math" is an odd
// thing to read under Language Arts. [name, what you're using].
const EXAMPLES = {
  language_arts: ['7th Grade Literature', 'A literature anthology and a writing workbook'],
  math: ['Pre-Algebra', 'A math textbook and workbook, chapters 1 to 8'],
  science: ['Life Science', 'A biology textbook with at-home labs'],
  social_studies: ['U.S. History', 'A history textbook and documentary series'],
  financial_literacy: ['Personal Finance', 'An online personal finance course'],
  health: ['Health and Nutrition', 'A health workbook'],
  pe: ['Swim Team', 'Practice three times a week with a local club'],
  fine_arts: ['Piano', 'Weekly lessons with a private teacher'],
  cte: ['Intro to Woodworking', 'A shop class at the community center'],
  digital_literacy: ['Intro to Coding', 'An online coding course'],
  electives: ['Photography', 'An online photography class'],
}
const GENERIC_EXAMPLE = ['Intro to Photography', 'A workbook or online class']

/**
 * "+ Add a quest" on a subject card. Everything a student does for credit is a
 * quest, so the page never says "course" (Tanner, 2026-09-28). Step one asks
 * which kind:
 *
 *   Your own curriculum -- step two is a short form. It is a quest underneath
 *     (an own-curriculum quest, POST /api/courses-and-credits/courses) whose
 *     semester check-ins earn this subject's XP.
 *   An Optio quest -- opens the quest library. A quest is not attached to a
 *     subject from here: once its tasks are approved it shows up under every
 *     subject they earned XP in.
 */
const AddCourseModal = ({ isOpen, onClose, onCreated, subject, courseLengths, studentId }) => {
  const navigate = useNavigate()
  const [step, setStep] = useState('choose')
  const [title, setTitle] = useState('')
  const [length, setLength] = useState(null)
  const [curriculum, setCurriculum] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setStep('choose')
      setTitle('')
      setLength(null)
      setCurriculum('')
      setError(null)
    }
  }, [isOpen, subject?.key])

  if (!subject) return null

  const canSave = !saving && title.trim().length > 0 && !!length
  const [exampleName, exampleUsing] = EXAMPLES[subject.key] || GENERIC_EXAMPLE

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await api.post('/api/courses-and-credits/courses', {
        title: title.trim(),
        subject: subject.key,
        length,
        curriculum: curriculum.trim() || undefined,
        ...(studentId ? { student_id: studentId } : {}),
      })
      toast.success(`${title.trim()} added to ${subject.name}`)
      onCreated?.()
      onClose()
    } catch (err) {
      const msg = err.response?.data?.error
      setError(typeof msg === 'string' ? msg : 'Could not add it. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const openQuestLibrary = () => {
    onClose()
    navigate('/quests')
  }

  const choice = (onClick, icon, heading, body) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-optio-purple/60 hover:bg-optio-purple/5 transition-all"
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-optio-purple/10 text-optio-purple flex items-center justify-center flex-shrink-0">
          {icon}
        </span>
        <span>
          <span className="block text-sm font-semibold text-gray-900">{heading}</span>
          <span className="block text-sm text-gray-500 mt-0.5">{body}</span>
        </span>
      </div>
    </button>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      closeOnOverlayClick={!saving}
      title={`Add a ${subject.name} quest`}
      size="md"
      footer={
        step === 'own' ? (
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setStep('choose')} disabled={saving} className="btn-quiet">
              Back
            </button>
            <button type="button" onClick={handleSave} disabled={!canSave} className="btn-primary">
              {saving && <Spinner size="sm" className="border-white" />}
              {saving ? 'Adding' : `Add to ${subject.name}`}
            </button>
          </div>
        ) : null
      }
    >
      {step === 'choose' && (
        <div className="space-y-3">
          {choice(
            () => setStep('own'),
            <BookOpenIcon className="w-5 h-5" aria-hidden="true" />,
            'Your own curriculum',
            'A workbook, online class, or anything else you already use.'
          )}
          {choice(
            openQuestLibrary,
            <OptioMark />,
            'An Optio quest',
            'Earn XP in multiple subjects through a quest.'
          )}
        </div>
      )}

      {step === 'own' && (
        <div className="space-y-5">
          <div>
            <label htmlFor="own-title" className="block text-sm font-medium text-gray-700">
              What is it called?
            </label>
            <input
              id="own-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              autoFocus
              placeholder={`e.g. ${exampleName}`}
              className="input-field mt-1"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700">How long is it?</legend>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {courseLengths.map((l) => {
                const selected = length === l.key
                return (
                  <button
                    key={l.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setLength(l.key)}
                    className={`text-left rounded-lg border p-3 transition-all ${
                      selected ? 'border-optio-purple bg-optio-purple/5' : 'border-gray-200 hover:border-optio-purple/60'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-gray-900">{l.label}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {xpWithCredits(creditsToXp(l.credits))}, {l.check_ins} check-in{l.check_ins === 1 ? '' : 's'}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="own-curriculum" className="block text-sm font-medium text-gray-700">
              What are you using? <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              id="own-curriculum"
              value={curriculum}
              onChange={(e) => setCurriculum(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder={`e.g. ${exampleUsing}`}
              className="input-field mt-1 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

AddCourseModal.propTypes = {
  isOpen: bool.isRequired,
  onClose: func.isRequired,
  onCreated: func,
  subject: shape({ key: string, name: string }),
  courseLengths: arrayOf(
    shape({
      key: string,
      label: string,
      credits: number,
      check_ins: number,
    })
  ).isRequired,
  studentId: string,
}

export default AddCourseModal
