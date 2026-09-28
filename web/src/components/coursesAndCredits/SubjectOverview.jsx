import React from 'react'
import { arrayOf, bool, func, number, object, shape, string } from 'prop-types'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import CreditProgressBar from './CreditProgressBar'
import { creditsToXp } from './xpLabels'
import { ELECTIVE_SUBJECT } from '../../utils/creditRequirements'

/**
 * Every required subject at a glance, between the diploma total and the
 * subject cards (2026-09-28). Each tile is the subject's progress in XP with
 * the same purple/yellow bar as its card; a click jumps to that card, which
 * carries the detail. A finished subject turns green but keeps its place: the
 * order is the diploma's, so a family learns where each one sits.
 *
 * Electives is not one more tile. It is where XP beyond any other subject's
 * requirement overflows (getCreditStanding), so it runs full width under the
 * others and says so -- which also leaves the rest an even ten, 5 by 2,
 * instead of eleven tiles and a hole.
 */
const SubjectOverview = ({ subjects, standingBySubject }) => {
  const jumpTo = (key) => {
    document.getElementById(`subject-card-${key}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  const complete = subjects.filter((s) => standingBySubject[s.key]?.isComplete).length
  const core = subjects.filter((s) => s.key !== ELECTIVE_SUBJECT)
  const electives = subjects.find((s) => s.key === ELECTIVE_SUBJECT)

  return (
    <section className="card mt-4" aria-labelledby="subject-overview-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="subject-overview-heading" className="text-sm font-semibold text-gray-900">
          Required subjects
        </h2>
        <p className="text-xs text-gray-500">
          {complete} of {subjects.length} complete
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {core.map((subject) => (
          <li key={subject.key}>
            <SubjectTile subject={subject} standing={standingBySubject[subject.key]} onClick={() => jumpTo(subject.key)} />
          </li>
        ))}
      </ul>
      {electives && (
        <div className="mt-2">
          <SubjectTile
            subject={electives}
            standing={standingBySubject[electives.key]}
            onClick={() => jumpTo(electives.key)}
            wide
          />
        </div>
      )}
    </section>
  )
}

function SubjectTile({ subject, standing = {}, onClick, wide = false }) {
  const done = !!standing.isComplete
  const requiredXp = creditsToXp(standing.creditsRequired || 0)
  const countedXp = creditsToXp(standing.creditsCounted || 0)
  const percent = Math.round(standing.progressPercentage || 0)

  const status = done
    ? <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0" aria-label="Complete" />
    : <span className="text-xs text-gray-500 flex-shrink-0">{percent}%</span>

  const bar = (
    <CreditProgressBar
      earnedPercent={standing.progressPercentage || 0}
      pendingXp={subject.pending_xp || 0}
      requiredXp={requiredXp}
      height="h-1.5"
      fillClass={done ? 'bg-green-500' : 'bg-gradient-primary'}
    />
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full h-full text-left rounded-lg border p-3 transition-all hover:shadow-sm ${
        done ? 'border-green-200 bg-green-50/60 hover:border-green-300' : 'border-gray-100 bg-gray-50/60 hover:border-optio-purple/40'
      }`}
    >
      {wide ? (
        <span className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <span className="sm:w-48 flex-shrink-0">
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-900">{subject.name}</span>
              <span className="sm:hidden">{status}</span>
            </span>
            <span className="block text-xs text-gray-500">Extra XP from any subject counts here</span>
          </span>
          <span className="flex-1">{bar}</span>
          <span className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-500">{countedXp.toLocaleString()} / {requiredXp.toLocaleString()} XP</span>
            <span className="hidden sm:inline">{status}</span>
          </span>
        </span>
      ) : (
        <span className="flex flex-col h-full">
          <span className="flex items-start justify-between gap-1.5 min-h-[2.5rem]">
            <span className="text-sm font-medium text-gray-900 leading-tight">{subject.name}</span>
            {status}
          </span>
          <span className="block mt-2">{bar}</span>
          <span className="block mt-1.5 text-xs text-gray-500">
            {countedXp.toLocaleString()} / {requiredXp.toLocaleString()} XP
          </span>
        </span>
      )}
    </button>
  )
}

SubjectTile.propTypes = {
  subject: shape({ key: string.isRequired, name: string.isRequired, pending_xp: number }).isRequired,
  standing: object,
  onClick: func.isRequired,
  wide: bool,
}

SubjectOverview.propTypes = {
  subjects: arrayOf(shape({ key: string.isRequired, name: string.isRequired, pending_xp: number })).isRequired,
  standingBySubject: object.isRequired,
}

export default SubjectOverview
