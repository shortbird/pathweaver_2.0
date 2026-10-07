import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Modal } from '../ui'
import PeoplePicker from './ui/PeoplePicker'
import SearchSelect from '../ui/SearchSelect'
import { useComposeAudience, useSendCompose } from '../../hooks/api/useSisMessaging'
import { useAuth } from '../../contexts/AuthContext'
import { messageDraftKey, readDraft, writeDraft, clearDraft } from '../communication/messageDrafts'

/**
 * Compose: one message to any mix of staff, families and students.
 *
 * iCreate, meeting of 2026-09-23 (bf8b754d): "Messaging becomes more like a
 * Gmail inbox - Compose, select who gets the message, the method (push
 * notification, email, optio message)". And 8ee000b6: "New message - option to
 * add the class teacher, class aide, and students."
 *
 * The School tab used to have three ways to start a message, each reaching
 * part of the school: one person, a group of staff, or families through a
 * separate picker behind a Staff | Families switch. Students could not be
 * reached at all. This is the one picker (message_compose_service on the
 * server):
 *
 *   - Filters show people; they never pick anyone. Role (several at once),
 *     class and age narrow the list; picks persist across filters, so "the
 *     Art families and the Robotics teacher" is one send (the rule the
 *     families picker learned on 2026-09-22, 77efe09b).
 *   - A class splits into its teacher, its aides, its students and its
 *     families, each one click.
 *   - Separately (the default) is a private thread each: no family sees
 *     another's reply. One group thread is for when everyone should see the
 *     answers.
 *   - The Optio message is always sent. Push and email are per-send toggles.
 *
 * Families and students always hear from the school, whichever tab this was
 * opened from, so their replies land in the School Inbox. Somebody on staff
 * always hears from you, even when they are also a parent here (iCreate,
 * 2026-09-25: a note "just to Molly" sent as the school went to the whole
 * office). The server says which for each person (`voice` on the audience,
 * message_compose_service.voice_for); `senderFor` only adds them up, so the
 * From line cannot disagree with what is sent.
 *
 * A teacher (asTeacher) sees only staff and their own classes' students and
 * families, always writes as themselves, and has no email copy -- the server
 * holds the same rules (message_compose_service).
 */

export const ROLE_FILTERS = [
  { key: 'teacher', label: 'Teachers' },
  { key: 'office', label: 'Office' },
  { key: 'staff', label: 'Other staff' },
  { key: 'family', label: 'Parents' },
  { key: 'student', label: 'Students' },
]

const KIND_WORDS = { staff: ['staff member', 'staff'], family: ['parent', 'parents'], student: ['student', 'students'] }

const plural = (n, [one, many]) => `${n} ${n === 1 ? one : many}`

/** The server's answer for one person, with the same rule as a fallback. */
export const voiceOf = (p) => p.voice || (p.kinds.includes('staff') ? 'you' : 'school')

/**
 * Who a send will come from: 'school', 'you', or 'both' when a separate send
 * mixes staff with families. `voices` is {school, you}, the count of chosen
 * people with each `voice`. A group has one owner: the school's when anyone
 * in it hears from the school, or when a staff group is started from the
 * school inbox.
 */
export const senderFor = ({ asSchool, group, voices }) => {
  if (group) return voices.school > 0 || asSchool ? 'school' : 'you'
  if (voices.school > 0 && voices.you > 0) return 'both'
  return voices.school > 0 ? 'school' : 'you'
}

/** Does this person pass the role filter? An empty filter passes everyone. */
const passesRole = (p, roles) => {
  if (!roles.size) return true
  if (roles.has('family') && p.kinds.includes('family')) return true
  if (roles.has('student') && p.kinds.includes('student')) return true
  return p.kinds.includes('staff') && (p.staff_kinds || []).some((k) => roles.has(k))
}

/**
 * The people the filters show. Pure, so the rules are tested on their own.
 *
 * Age describes students, so it narrows students by their own age and
 * families by their children's; staff drop out of an age-filtered list. A
 * student with no birth date on file cannot be placed and is left out (the
 * modal says how many).
 */
export const filterPeople = (people, classes, { roles = new Set(), classId = '', ageMin = '', ageMax = '' } = {}) => {
  const cls = classId ? classes.find((c) => c.id === classId) : null
  const inClass = cls ? new Set([...cls.teacher_ids, ...cls.aide_ids, ...cls.student_ids]) : null
  const classStudents = cls ? new Set(cls.student_ids) : null
  const studentAge = new Map(people.filter((p) => p.kinds.includes('student')).map((p) => [p.id, p.age]))
  const lo = ageMin === '' ? null : Number(ageMin)
  const hi = ageMax === '' ? null : Number(ageMax)
  const ageFiltered = lo !== null || hi !== null
  const ageOk = (age) => age !== null && age !== undefined
    && (lo === null || age >= lo) && (hi === null || age <= hi)

  return people.filter((p) => {
    if (!passesRole(p, roles)) return false
    const childIds = p.child_ids || []
    if (cls && !inClass.has(p.id) && !childIds.some((c) => classStudents.has(c))) return false
    if (ageFiltered) {
      const ownAge = p.kinds.includes('student') && ageOk(p.age)
      const childAge = childIds.some((c) => ageOk(studentAge.get(c))
        && (!classStudents || classStudents.has(c)))
      if (!ownAge && !childAge) return false
    }
    return true
  })
}

/** A class's four one-click picks: its teachers, aides, students, families. */
export const classPartIds = (cls, people) => {
  if (!cls) return null
  const students = new Set(cls.student_ids)
  return {
    teachers: cls.teacher_ids,
    aides: cls.aide_ids,
    students: cls.student_ids,
    families: people.filter((p) => p.kinds.includes('family')
      && (p.child_ids || []).some((c) => students.has(c))).map((p) => p.id),
  }
}

const describe = (p) => {
  const bits = []
  if (p.kinds.includes('staff')) bits.push((p.role_labels || []).join(', ') || 'Staff')
  if (p.kinds.includes('family')) bits.push(`Parent of ${(p.children || []).join(', ') || 'a student'}`)
  if (p.kinds.includes('student')) bits.push(p.age !== null && p.age !== undefined ? `Student, ${p.age}` : 'Student')
  return bits.join(' · ')
}

/**
 * The words outlive the dialog; the people do not (ticket e6cc5fe5, iCreate
 * campus coordinator: "Can we make our drafts save when we switch out of
 * messages and then come back to it?"). The subject and message are kept per
 * signed-in user in localStorage (messageDrafts) and come back when Compose
 * opens again, after a close or a reload. A successful send removes them; a
 * failed send keeps them.
 *
 * The picks, the filters, the group name and the channels are still thrown
 * away on close. Last week's words reappearing is a sentence to delete; last
 * week's people reappearing is a message to the wrong family. Compose is
 * never opened pre-addressed, so one draft per user (per org) is enough.
 */
export const composeDraftKey = (userId, orgId) =>
  messageDraftKey(userId, orgId ? `compose:sis:${orgId}` : 'compose:sis')

const readComposeDraft = (key) => {
  try {
    const saved = JSON.parse(readDraft(key) || '{}')
    return { subject: String(saved.subject || ''), body: String(saved.body || '') }
  } catch {
    return { subject: '', body: '' }
  }
}

const writeComposeDraft = (key, subject, body) => {
  if (subject.trim() || body.trim()) writeDraft(key, JSON.stringify({ subject, body }))
  else clearDraft(key)
}

export default function ComposeMessageModal({ isOpen, ...props }) {
  return isOpen ? <ComposeDialog {...props} /> : null
}

function ComposeDialog({ orgId, orgName = '', asSchool = false, asTeacher = false, onClose, onSent }) {
  const audienceQuery = useComposeAudience(orgId)
  const data = audienceQuery.isError ? {} : (audienceQuery.data || null)
  const sendMutation = useSendCompose(orgId)
  const { user } = useAuth()
  const draftKey = composeDraftKey(user?.id, orgId)
  const [draft] = useState(() => readComposeDraft(draftKey))
  const [roles, setRoles] = useState(() => new Set())
  const [classId, setClassId] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [chosen, setChosen] = useState(() => new Set())
  const [mode, setMode] = useState('separate')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [push, setPush] = useState(true)
  const [email, setEmail] = useState(false)
  const [showAllTo, setShowAllTo] = useState(false)
  const busy = sendMutation.isPending

  useEffect(() => {
    if (audienceQuery.isError) toast.error('Could not load the school directory')
  }, [audienceQuery.isError])

  const people = data?.people || []
  const classes = data?.classes || []
  const byId = new Map(people.map((p) => [p.id, p]))
  const shown = filterPeople(people, classes, { roles, classId, ageMin, ageMax })
  const cls = classes.find((c) => c.id === classId)
  const parts = classPartIds(cls, people)

  const digits = (v) => v.replace(/\D/g, '').slice(0, 3)
  const toggleRole = (key) => setRoles((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggle = (id) => setChosen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const addAll = (ids) => setChosen((prev) => new Set([...prev, ...(ids || [])]))
  const allShownChosen = shown.length > 0 && shown.every((p) => chosen.has(p.id))
  const clearShown = () => setChosen((prev) => {
    const next = new Set(prev)
    shown.forEach((p) => next.delete(p.id))
    return next
  })

  // What the selection is, in words: "3 staff, 12 parents, 1 student".
  // Somebody on staff counts as staff, whatever else they are: that is how
  // they are written to.
  const counts = { staff: 0, family: 0, student: 0 }
  const voices = { school: 0, you: 0 }
  chosen.forEach((id) => {
    const p = byId.get(id)
    if (!p) return
    const kind = p.kinds.includes('staff') ? 'staff' : p.kinds.includes('student') ? 'student' : 'family'
    counts[kind] += 1
    voices[voiceOf(p)] += 1
  })
  const summary = Object.entries(counts).filter(([, n]) => n)
    .map(([k, n]) => plural(n, KIND_WORDS[k])).join(', ')
  const hasFamily = voices.school > 0
  const willBeGroup = mode === 'group' && chosen.size > 1
  const school = orgName || 'the school'
  const from = senderFor({ asSchool: asSchool && !asTeacher, group: willBeGroup, voices })

  const send = async () => {
    if (!chosen.size) { toast.error('Choose at least one person'); return }
    if (!body.trim()) { toast.error('Write something to send'); return }
    try {
      const result = await sendMutation.mutateAsync({
        recipient_ids: [...chosen],
        mode,
        subject: subject.trim() || undefined,
        name: willBeGroup ? (name.trim() || undefined) : undefined,
        body: body.trim(),
        push,
        email: asTeacher ? false : email,
        as_school: asTeacher ? false : asSchool,
      })
      clearDraft(draftKey)
      toast.success(
        (result.mode === 'group'
          ? `Sent to ${plural(result.sent, ['person', 'people'])} in one thread`
          : `Sent to ${plural(result.sent, ['person', 'people'])}, each in their own thread`)
        + (result.emailed ? `, and emailed ${result.emailed}` : ''))
      if (result.skipped?.length) toast.error(`${result.skipped.length} could not be reached`)
      onSent?.(result)
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send the message')
    }
  }

  // Every chosen person, as a To: line above the list (ticket ebd3ad60, Molly
  // at iCreate: "Once I select people to send to, I don't know who I
  // selected"). It used to list only the picks the current filter hid, so a
  // pick still on screen was a tick somewhere in a scrolling list and the
  // footer said only "2 staff, 1 parent". Capped so a whole-school send does
  // not push the list off the dialog; "and N more" opens the rest.
  const toIds = [...chosen]
  const TO_SHOWN = 12
  const toVisible = showAllTo ? toIds : toIds.slice(0, TO_SHOWN)
  const partButton = (label, ids) => (
    <button type="button" onClick={() => addAll(ids)} disabled={!ids?.length}
      className="px-2.5 py-1 rounded-full border border-gray-300 text-xs text-neutral-700 hover:border-optio-purple hover:text-optio-purple disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-neutral-700">
      {label} <span className="text-neutral-400">{ids?.length || 0}</span>
    </button>
  )

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Compose"
      size="lg"
      footer={(
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-neutral-500" aria-live="polite">
            {chosen.size ? `${summary}${willBeGroup ? ' · one thread' : ' · a private thread each'}` : 'Nobody selected yet'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">
              Cancel
            </button>
            <button type="button" onClick={send} disabled={busy || !chosen.size || !body.trim()}
              className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    >
      {!data ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-neutral-50 border border-gray-200 px-3 py-2 text-sm" aria-live="polite">
            <span className="text-neutral-500">From: </span>
            <span className="font-semibold text-neutral-900">
              {from === 'school' ? school : from === 'both' ? `${school} and you` : 'You'}
            </span>
            {!asTeacher && (
              <span className="block text-xs text-neutral-500 mt-0.5">
                {from === 'you'
                  ? 'Staff see your name, and their replies come to your My messages.'
                  : from === 'both'
                    ? `Parents and students hear from ${school}, and their replies come to the ${school} inbox. Staff hear from you, and their replies come to your My messages.`
                    : hasFamily
                      ? `Parents and students hear from ${school}. Their replies come to the ${school} inbox.`
                      : `A group from ${school}. Everyone in it sees that you wrote each message.`}
              </span>
            )}
          </div>
          <section aria-label="Who gets it" className="space-y-3">
            <div>
              <span className="block text-xs font-medium text-neutral-600 mb-1">Show</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by role">
                {ROLE_FILTERS.map((r) => (
                  <button key={r.key} type="button" onClick={() => toggleRole(r.key)}
                    aria-pressed={roles.has(r.key)}
                    className={`px-2.5 py-1 rounded-full border text-xs ${roles.has(r.key)
                      ? 'border-optio-purple bg-optio-purple/10 text-optio-purple font-semibold'
                      : 'border-gray-300 text-neutral-700 hover:border-optio-purple'}`}>
                    {r.label}
                  </button>
                ))}
                {roles.size > 0 && (
                  <button type="button" onClick={() => setRoles(new Set())}
                    className="text-xs text-neutral-500 hover:underline px-1">Everyone</button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-xs font-medium text-neutral-600 mb-1">Class</span>
                <SearchSelect value={classId} onChange={setClassId} options={classes}
                  getId={(c) => c.id} getLabel={(c) => c.name}
                  placeholder={asTeacher ? 'All my classes' : 'Every class'}
                  emptyLabel={asTeacher ? 'All my classes' : 'Every class'} />
              </div>
              <div>
                <span className="block text-xs font-medium text-neutral-600 mb-1">Student ages (optional)</span>
                <div className="flex items-center gap-2">
                  <input inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(digits(e.target.value))}
                    placeholder="from" aria-label="Youngest age"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
                  <span className="text-sm text-neutral-500">to</span>
                  <input inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(digits(e.target.value))}
                    placeholder="to" aria-label="Oldest age"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
                </div>
                {(ageMin !== '' || ageMax !== '') && data.without_birthdate > 0 && (
                  <span className="block text-xs text-amber-700 mt-1">
                    {plural(data.without_birthdate, ['student has', 'students have'])} no birth date on file and {data.without_birthdate === 1 ? 'is' : 'are'} left out.
                  </span>
                )}
              </div>
            </div>

            {parts && (
              <div>
                <span className="block text-xs font-medium text-neutral-600 mb-1">Add from {cls.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {partButton(parts.teachers.length === 1
                    ? `Teacher: ${byId.get(parts.teachers[0])?.name || 'Teacher'}` : 'Teachers', parts.teachers)}
                  {partButton(parts.aides.length === 1
                    ? `Aide: ${byId.get(parts.aides[0])?.name || 'Aide'}` : 'Aides', parts.aides)}
                  {partButton('Students', parts.students)}
                  {partButton('Families', parts.families)}
                </div>
              </div>
            )}

            {(data.presets || []).length > 0 && !classId && (
              <div>
                <span className="block text-xs font-medium text-neutral-600 mb-1">Staff quick picks</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.presets.map((preset) => (
                    <button key={preset.key} type="button" onClick={() => addAll(preset.member_ids)}
                      title={preset.description || undefined}
                      className="px-2.5 py-1 rounded-full border border-gray-300 text-xs text-neutral-700 hover:border-optio-purple hover:text-optio-purple">
                      {preset.label} <span className="text-neutral-400">{preset.member_ids.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {toIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-live="polite" aria-label="To">
                <span className="text-neutral-500 font-medium">To:</span>
                {toVisible.map((id) => {
                  const label = byId.get(id)?.name || 'Someone'
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2 py-0.5 text-optio-purple">
                      {label}
                      <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${label}`}
                        className="font-bold hover:text-optio-pink">×</button>
                    </span>
                  )
                })}
                {toIds.length > TO_SHOWN && (
                  <button type="button" onClick={() => setShowAllTo((v) => !v)}
                    className="text-optio-purple hover:underline">
                    {showAllTo ? 'Show fewer' : `and ${toIds.length - TO_SHOWN} more`}
                  </button>
                )}
                <button type="button" onClick={() => setChosen(new Set())}
                  className="text-neutral-500 hover:underline ml-1">Clear all</button>
              </div>
            )}

            <PeoplePicker people={shown} selected={chosen} onToggle={toggle}
              getLabel={(p) => p.name || 'Unnamed'}
              getSearchText={(p) => `${p.name || ''} ${(p.children || []).join(' ')} ${(p.role_labels || []).join(' ')}`}
              renderMeta={(p) => <span className="block text-xs text-neutral-500 truncate">{describe(p)}</span>}
              actions={shown.length > 0 && (
                <button type="button" onClick={allShownChosen ? clearShown : () => addAll(shown.map((p) => p.id))}
                  className="text-xs text-optio-purple hover:underline whitespace-nowrap">
                  {allShownChosen ? 'Clear' : `Select all ${shown.length}`}
                </button>
              )}
              placeholder="Search by name, child or role" searchLabel="Search people"
              emptyLabel="Nobody matches these filters." />
          </section>

          {chosen.size > 1 && (
            <fieldset>
              <legend className="text-xs font-medium text-neutral-600 mb-1">How it goes out</legend>
              <div className="space-y-1.5 text-sm text-neutral-700">
                <label className="flex items-start gap-2">
                  <input type="radio" name="compose-mode" className="mt-0.5"
                    checked={mode === 'separate'} onChange={() => setMode('separate')} />
                  <span>
                    Separately
                    <span className="block text-xs text-neutral-500">A private thread each. Nobody sees anyone else&apos;s reply.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="compose-mode" className="mt-0.5"
                    checked={mode === 'group'} onChange={() => setMode('group')} />
                  <span>
                    One group thread
                    <span className="block text-xs text-neutral-500">
                      Everyone sees every reply.{hasFamily ? ' Families in it see each other.' : ''}
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          )}

          {willBeGroup && (
            <div>
              <label className="block text-xs text-neutral-500 mb-1" htmlFor="compose-group-name">
                Name this thread (optional)
              </label>
              <input id="compose-group-name" value={name} onChange={(e) => setName(e.target.value)}
                maxLength={100} placeholder="Field trip drivers"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
            </div>
          )}

          <div>
            <label className="block text-xs text-neutral-500 mb-1" htmlFor="compose-subject">Subject (optional)</label>
            <input id="compose-subject" value={subject} onChange={(e) => { setSubject(e.target.value); writeComposeDraft(draftKey, e.target.value, body) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1" htmlFor="compose-body">Message</label>
            <textarea id="compose-body" value={body} onChange={(e) => { setBody(e.target.value); writeComposeDraft(draftKey, subject, e.target.value) }}
              rows={5} maxLength={2000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-neutral-600 mb-1">Send by</legend>
            <div className="space-y-1.5 text-sm text-neutral-700">
              <label className="flex items-center gap-2 text-neutral-500">
                <input type="checkbox" checked disabled /> Optio message (always)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
                Push notification to their phone or browser
              </label>
              {!asTeacher && (
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5" checked={email} onChange={(e) => setEmail(e.target.checked)} />
                  <span>
                    Email
                    <span className="block text-xs text-neutral-500">A copy by email, for people who do not open the app. Replies still come to Optio.</span>
                  </span>
                </label>
              )}
            </div>
          </fieldset>
          {asTeacher && (
            <p className="text-xs text-neutral-500">
              This comes from you, and replies come to your messages. You can write to staff,
              and to the students and families in your classes.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
