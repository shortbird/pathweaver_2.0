/**
 * Funnel preview steps 3 and 4: the questions/contacts step, and the school
 * records step credit partners get.
 *
 * They share one editor -- the records switch is reachable from both, because
 * turning it on is what makes the records step exist -- so they live in one
 * file rather than duplicating `RecordsEditor` into two.
 */
import React from 'react'
import { Section, PrimaryButton, QuestionField, field } from '../../registration/funnelUi'
import { Editable, mockInput } from './setupChrome'

// Turning this on adds a funnel step asking, per student, which school's
// registrar receives their Optio Academy transcript. Enrolling in Optio
// Academy is the separate switch: a partner might collect the destination
// without enrolling, or enroll a family who has no school of record yet.
const RecordsEditor = ({ askRecords, setAskRecords, academyEnroll, setAcademyEnroll }) => (
  <div className="space-y-3">
    <label className="flex items-start gap-2 text-sm text-neutral-700 select-none">
      <input type="checkbox" checked={askRecords}
        onChange={(e) => setAskRecords(e.target.checked)}
        className="mt-0.5 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
      <span>
        Ask each family where their student&rsquo;s transcript should be sent
        <span className="block text-xs text-neutral-500">
          Adds a School records step to the funnel. Turn this on for credit partner programs.
        </span>
      </span>
    </label>
    <label className="flex items-start gap-2 text-sm text-neutral-700 select-none">
      <input type="checkbox" checked={academyEnroll}
        onChange={(e) => setAcademyEnroll(e.target.checked)}
        className="mt-0.5 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
      <span>
        Enroll each registered student in Optio Academy
        <span className="block text-xs text-neutral-500">
          Happens when the family finishes registering. This is what puts Optio Academy&rsquo;s
          accreditation on their transcript.
        </span>
      </span>
    </label>
  </div>
)

export const DetailsStepPreview = ({
  academyEnroll, setAcademyEnroll, addOption, asOptions, askContacts, setAskContacts,
  askRecords, setAskRecords, openZones, toggleZone, optFocus, patchOptions,
  questions, setQ, setQuestions,
}) => {
const questionEditor = (q, i) => {
  const opts = asOptions(q)
  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input className={`${field} sm:flex-1`} placeholder="Question label"
          value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} />
        <select className={`${field} sm:w-44`} value={q.type || 'select'}
          onChange={(e) => setQ(i, { type: e.target.value })}>
          <option value="select">Pick one</option>
          <option value="multi">Pick multiple</option>
          <option value="text">Text answer</option>
        </select>
        <button onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
          className="text-red-500 text-sm px-2 hover:underline">Remove</button>
      </div>
      <textarea rows={2} className={field} placeholder="Help text shown under the question (optional)"
        value={q.help || ''} onChange={(e) => setQ(i, { help: e.target.value })} />
      {q.type !== 'text' && (
        <div className="pl-1">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5">Answer options</p>
          <div className="space-y-1.5">
            {opts.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <span className={`w-3.5 h-3.5 shrink-0 border-2 border-gray-300 ${q.type === 'multi' ? 'rounded' : 'rounded-full'}`} />
                <input
                  ref={(el) => { if (el && optFocus.current === `${i}:${oi}`) { el.focus(); optFocus.current = null } }}
                  className={`${field} flex-1`}
                  placeholder={`Option ${oi + 1}`}
                  value={opt}
                  onChange={(e) => patchOptions(i, (os) => os.map((o, j) => (j === oi ? e.target.value : o)))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(i) } }}
                />
                <button onClick={() => patchOptions(i, (os) => os.filter((_, j) => j !== oi))}
                  aria-label={`Remove option ${oi + 1}`}
                  className="text-neutral-400 hover:text-red-500 text-lg leading-none px-1">×</button>
              </div>
            ))}
            {opts.length === 0 && <p className="text-xs text-neutral-400">No options yet.</p>}
          </div>
          <button onClick={() => addOption(i)} className="mt-1.5 text-sm font-medium text-optio-purple hover:underline">
            + Add option
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1 pl-1">
        <label className="flex items-center gap-2 text-xs text-neutral-500 select-none">
          <input type="checkbox" checked={q.required !== false}
            onChange={(e) => setQ(i, { required: e.target.checked })}
            className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
          Required
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-500 select-none">
          <input type="checkbox" checked={!!q.per_student}
            onChange={(e) => setQ(i, { per_student: e.target.checked })}
            className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
          Asked once per child (instead of once per family)
        </label>
      </div>
    </div>
  )
}

const familyQs = questions.filter((q) => !q.per_student)
const studentQs = questions.filter((q) => q.per_student)

const contactsEditor = (
  <label className="flex items-center gap-2 text-sm text-neutral-700 select-none">
    <input type="checkbox" checked={askContacts}
      onChange={(e) => setAskContacts(e.target.checked)}
      className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
    Ask families for emergency contacts (at least one required)
  </label>
)

const detailsStep = (
  <div className="space-y-6">
    <Editable label="Edit" open={openZones.has('contacts')} onToggle={() => toggleZone('contacts')} editor={contactsEditor}>
      {askContacts ? (
        <Section title="Emergency contacts" subtitle="Add at least one emergency contact for your family.">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-neutral-700">Contact 1</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={mockInput} readOnly placeholder="Full name" value="" />
              <select className={mockInput} disabled><option>Relationship</option></select>
              <input className={mockInput} readOnly placeholder="Phone" value="" />
              <input className={mockInput} readOnly placeholder="Email (optional)" value="" />
            </div>
          </div>
        </Section>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-3 text-sm text-neutral-400">
          Emergency contacts are turned off — families skip straight to your questions.
        </div>
      )}
    </Editable>

    <Section title="A few questions">
      <div className="space-y-5">
        {questions.length === 0 && (
          <p className="text-sm text-neutral-400">
            No intake questions yet — add one below and it appears here exactly as families will see it.
          </p>
        )}
        {familyQs.map((q) => {
          const i = questions.indexOf(q)
          return (
            <Editable key={q.key || `q-${i}`} open={openZones.has(`q-${i}`)} onToggle={() => toggleZone(`q-${i}`)}
              editor={questionEditor(q, i)}>
              <div className="p-1">
                <div className="pointer-events-none">
                  <QuestionField q={q} value={q.type === 'multi' ? [] : ''} onChange={() => {}} />
                </div>
              </div>
            </Editable>
          )
        })}
        {studentQs.length > 0 && (
          <div className={familyQs.length ? 'pt-4 border-t border-gray-100' : ''}>
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">Your child</h3>
            <p className="text-[11px] text-neutral-400 mb-3">↓ These repeat for each child on the registration.</p>
            <div className="space-y-5">
              {studentQs.map((q) => {
                const i = questions.indexOf(q)
                return (
                  <Editable key={q.key || `q-${i}`} open={openZones.has(`q-${i}`)} onToggle={() => toggleZone(`q-${i}`)}
                    editor={questionEditor(q, i)}>
                    <div className="p-1">
                      <div className="pointer-events-none">
                        <QuestionField q={q} value={q.type === 'multi' ? [] : ''} onChange={() => {}} />
                      </div>
                    </div>
                  </Editable>
                )
              })}
            </div>
          </div>
        )}
        <button
          onClick={() => {
            setQuestions((qs) => [...qs, { key: '', label: '', help: '', type: 'select', options: ['', ''], required: true, per_student: false }])
            toggleZone(`q-${questions.length}`)
          }}
          className="text-sm font-medium text-optio-purple hover:underline">
          + Add question
        </button>
      </div>
    </Section>
    <Editable label="Edit" open={openZones.has('records')} onToggle={() => toggleZone('records')} editor={<RecordsEditor {...{ askRecords, setAskRecords, academyEnroll, setAcademyEnroll }} />}>
      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-neutral-600">
        <span className="font-medium text-neutral-800">Optio Academy credit</span>
        <p className="mt-1">
          {askRecords
            ? 'Families are asked where each student\u2019s transcript should be sent. See the School records step.'
            : 'Families are not asked where transcripts should be sent.'}
        </p>
        <p className="mt-1">
          {academyEnroll
            ? 'Finishing registration enrolls each student in Optio Academy.'
            : 'Finishing registration does not enroll anyone in Optio Academy.'}
        </p>
      </div>
    </Editable>
    <div className="pointer-events-none"><PrimaryButton>Continue</PrimaryButton></div>
  </div>
)

  return detailsStep
}

export const RecordsStepPreview = ({
  academyEnroll, setAcademyEnroll, askRecords, setAskRecords, openZones, toggleZone,
}) => (
  <div className="space-y-6">
    <Editable label="Edit" open={openZones.has('records')} onToggle={() => toggleZone('records')} editor={<RecordsEditor {...{ askRecords, setAskRecords, academyEnroll, setAcademyEnroll }} />}>
      <Section
        title="Where should the school records go?"
        subtitle="Credit is issued by Optio Academy on an official transcript. Tell us where each student's transcript should be sent, so we can send it for you when credit is awarded."
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-neutral-800">Is your child enrolled in a school?</label>
          <select className={mockInput} disabled><option>-- Please select --</option></select>
          <input className={mockInput} readOnly placeholder="School name" value="" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={mockInput} readOnly placeholder="City" value="" />
            <input className={mockInput} readOnly placeholder="State" value="" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={mockInput} readOnly placeholder="Registrar name" value="" />
            <input className={mockInput} readOnly placeholder="Registrar email" value="" />
          </div>
          <label className="flex items-start gap-2 text-sm text-neutral-600">
            <input type="checkbox" readOnly checked={false} className="mt-1 pointer-events-none" />
            <span>Send the official transcript to this school automatically once credit is awarded.</span>
          </label>
        </div>
      </Section>
    </Editable>
  </div>
)
