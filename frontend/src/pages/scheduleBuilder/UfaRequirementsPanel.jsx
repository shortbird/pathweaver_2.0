/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import ClassDetailsModal, { meetingText, money } from '../../components/schedule/ClassDetailsModal'
import SLOT_DAYS from './SLOT_DAYS'
import DAY_LONG from './DAY_LONG'
import UfaRow from './UfaRow'

/**
 * UFA private school requirements checklist (iCreate feedback 2026-07-21):
 * 3 instructional days with at least 5 blocks of in-person classes. One of the
 * 3 days may be a learning day — a recorded choice, not a class: families with
 * no Mon/Wed classes MUST take the Elementary At-Home Academic Learning Day;
 * families with only Mon/Wed classes choose it or the Quest Learning Day.
 * A 4th day isn't covered by the flat tuition and is billed a-la-carte.
 */
const UfaRequirementsPanel = ({ ufa, totalBlocks, ufaShortfall, campusDays, totalDays,
  includedDays, learningChoice, learningDayNeeded, mustChooseElementary, extraCharge,
  orgName, locked, busy, onSelect }) => {
  const dayNames = campusDays.map((d) => SLOT_DAYS[d]).join(', ')
  const blocksMet = ufaShortfall === 0 && totalBlocks > 0
  const daysMet = totalDays >= includedDays && campusDays.length > 0
  const choiceMet = !learningDayNeeded || !!learningChoice
  const allMet = blocksMet && daysMet && choiceMet && !extraCharge
  return (
    <div className={`mb-5 rounded-xl border p-4 ${allMet ? 'border-green-200 bg-green-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-900">UFA Private School requirements</h2>
        <span className={`text-xs font-semibold ${allMet ? 'text-green-700' : 'text-amber-700'}`}>
          {allMet ? 'All requirements met' : 'Not met yet'}
        </span>
      </div>
      <div className="space-y-2.5">
        <UfaRow met={blocksMet}>
          At least {ufa.min_blocks} blocks of in-person classes —{' '}
          <span className="font-medium">{totalBlocks} scheduled</span>
          {ufaShortfall > 0 ? `, add ${ufaShortfall} more block${ufaShortfall === 1 ? '' : 's'}` : ''}.
        </UfaRow>
        <UfaRow met={daysMet}>
          {includedDays} instructional days —{' '}
          <span className="font-medium">
            {totalDays} of {includedDays}
          </span>
          {campusDays.length > 0 ? ` (${dayNames}${learningChoice ? ' + learning day' : ''})` : ''}.
        </UfaRow>
        {(learningDayNeeded || learningChoice) && (
          <UfaRow met={choiceMet}>
            <div>
              Learning day{learningDayNeeded ? ' (required to reach 3 days)' : ''} —{' '}
              {learningChoice
                ? <span className="font-medium">{learningChoice === 'quest_learning_day' ? 'Quest Learning Day' : 'Elementary At-Home Academic Learning Day'}</span>
                : <span className="font-medium">choose one below</span>}
              {mustChooseElementary && (
                <p className="text-xs text-amber-700 mt-1">
                  Without Monday/Wednesday classes, UFA private school students must choose the
                  Elementary At-Home Academic Learning Day.
                </p>
              )}
              {!locked && (
                <div className="mt-2 space-y-1.5">
                  {[
                    { value: 'quest_learning_day', label: 'Quest Learning Day', disabled: mustChooseElementary },
                    { value: 'elementary_at_home', label: 'Elementary At-Home Academic Learning Day', disabled: false },
                  ].map((opt) => (
                    <label key={opt.value}
                      className={`flex items-center gap-2 text-sm ${opt.disabled ? 'text-gray-300' : 'text-gray-700 cursor-pointer'}`}>
                      <input type="radio" name="ufa-learning-day" value={opt.value}
                        checked={learningChoice === opt.value}
                        disabled={opt.disabled || busy}
                        onChange={() => onSelect(opt.value)}
                        className="text-optio-purple focus:ring-optio-purple" />
                      {opt.label}
                    </label>
                  ))}
                  {learningChoice === 'elementary_at_home' && (
                    <p className="text-xs text-gray-500">
                      {orgName} will follow up with the at-home academic learning day options form.
                    </p>
                  )}
                  {learningChoice && (
                    <button type="button" onClick={() => onSelect(null)} disabled={busy}
                      className="text-xs text-gray-400 underline hover:text-gray-600 disabled:opacity-50">
                      Clear choice
                    </button>
                  )}
                </div>
              )}
            </div>
          </UfaRow>
        )}
        {extraCharge && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            UFA tuition covers {includedDays} instructional days — this schedule has {totalDays}.
            {' '}The class{extraCharge.classNames.length === 1 ? '' : 'es'} meeting only on{' '}
            {extraCharge.days.map((d) => DAY_LONG[d]).join(' and ')}
            {extraCharge.classNames.length ? ` (${extraCharge.classNames.join(', ')})` : ''} will be
            billed to you personally{extraCharge.priceCents ? `: ${money(extraCharge.priceCents)}` : ''}.
          </div>
        )}
      </div>
    </div>
  )
}

// Classes offered in the clicked time slot. Rows add directly; "Details" swaps
// to the full read-only class modal.

export default UfaRequirementsPanel
