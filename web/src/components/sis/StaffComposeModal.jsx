import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Modal } from '../ui'
import PeoplePicker from './ui/PeoplePicker'
import SearchSelect from '../ui/SearchSelect'
import FamilyAudiencePicker from './FamilyAudiencePicker'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * Write to several staff at once.
 *
 * The console offered exactly one way to reach teachers: pick one person, and
 * do it again for the next one. The only multi-select anywhere in it was the
 * announcement composer, which is a broadcast — no thread, no replies, and
 * everyone notified whether it concerns them or not. So "the three of you
 * covering Ada's block" was either five separate messages or an announcement to
 * the whole school (iCreate, 2026-09-10).
 *
 * Two shapes, both real:
 *
 *   Group (default) — one thread everyone can reply in. "Did the room get
 *   sorted?" is a question the whole group wants the answer to, and N private
 *   copies of it means N people asking it.
 *
 *   Send separately — one private message each. For the same words to
 *   different people when the replies should not be shared.
 *
 * Presets (all teachers, the front office, one class's teachers, everyone
 * teaching Thursday) come back from the server WITH their member ids, so
 * ticking one fills the chip list and any single person can still be removed
 * before sending. "All teachers except Sam" is the common case.
 *
 * Families are the other audience (2026-09-18; Molly, b4a4d250 and b32b2fca:
 * "I'm needing to message all the elementary school parents, but I have no
 * way to do that"). Pick students -- every class or one, an age range -- and
 * the message goes to their parents, each in their own private thread from
 * the school, so replies land in the School Inbox and no family sees another.
 * No group mode there, by design. The filter and list live in
 * FamilyAudiencePicker; this modal keeps the words and the send.
 *
 * Staff can be copied on a family message (Molly, 77efe09b: "I just sent a
 * message to the CLD parents. But I couldn't add the teacher on to that
 * message too"). Each gets their own copy from the sender, marked as a copy;
 * the families' threads are untouched and never show who was copied. Why the
 * copy comes from the sender and not the school: sis_family_messaging_service.
 */

const AUDIENCES = [['staff', 'Staff'], ['families', 'Families']]

const nameOf = (p) => p?.name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Staff'

// `asSchool`: opened from the School tab, so the staff send belongs to the
// school -- a group the school inbox owns, or separate messages from the
// school -- instead of landing in the sender's personal Messages (iCreate,
// ac84b6cd). From My messages it stays the sender's own.
export default function StaffComposeModal({ isOpen, orgId, onClose, onSent, initialAudience = 'staff', asSchool = false }) {
  // The opener says which audience to start on ("Message families" on the
  // school tab); a switch inside overrides it until the modal closes.
  const [audienceOverride, setAudienceOverride] = useState(null)
  const audience = audienceOverride || initialAudience
  const setAudience = setAudienceOverride
  const [people, setPeople] = useState([])
  const [presets, setPresets] = useState([])
  // Split by what the preset names: a standing group of the school, or one
  // class. The first few belong on screen; the class ones are a search.
  const groupPresets = presets.filter((p) => !p.key.startsWith('class:'))
  const classPresets = presets.filter((p) => p.key.startsWith('class:'))
  const [loading, setLoading] = useState(true)
  const [chosen, setChosen] = useState(() => new Set())
  const [separate, setSeparate] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  // Families: the picker owns the filter and fetch; the modal keeps who was
  // found and who is still ticked, because the send needs both.
  const [families, setFamilies] = useState([])
  const [chosenFamilies, setChosenFamilies] = useState(() => new Set())
  const [emailToo, setEmailToo] = useState(false)
  const [copyStaff, setCopyStaff] = useState(() => new Set())
  const [audienceLabel, setAudienceLabel] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    api.get(withOrg('/api/sis/messaging/recipients', orgId))
      .then((r) => {
        setPeople(r.data?.people || [])
        setPresets(r.data?.presets || [])
      })
      .catch(() => toast.error('Could not load the staff list'))
      .finally(() => setLoading(false))
  }, [isOpen, orgId])

  // Reset between opens: a half-written message to last week's group reappearing
  // is worse than retyping a sentence.
  useEffect(() => {
    if (isOpen) return
    setChosen(new Set()); setSubject(''); setBody('')
    setName(''); setSeparate(false)
    setFamilies([]); setChosenFamilies(new Set()); setEmailToo(false)
    setCopyStaff(new Set()); setAudienceLabel('')
    setAudienceOverride(null)
  }, [isOpen])

  const toFamilies = audience === 'families'
  const recipientCount = toFamilies ? chosenFamilies.size : chosen.size

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const toggle = (id) => setChosen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const addPreset = (preset) => setChosen((prev) => {
    const next = new Set(prev)
    ;(preset.member_ids || []).forEach((id) => next.add(id))
    return next
  })

  // A group of two people is a DM: making a named room for it would leave the
  // recipient with a group instead of a conversation. So the toggle is only
  // meaningful once there are two recipients, and the server enforces the same.
  const willBeGroup = !separate && chosen.size > 1

  const sendToFamilies = async () => {
    if (!chosenFamilies.size) { toast.error('Choose at least one family'); return }
    if (!body.trim()) { toast.error('Write something to send'); return }
    setBusy(true)
    try {
      const res = await api.post(withOrg('/api/sis/messaging/compose-families', orgId), {
        recipient_ids: [...chosenFamilies],
        subject: subject.trim() || undefined,
        body: body.trim(),
        email: emailToo,
        // Only when someone is copied, so a plain family send is unchanged.
        ...(copyStaff.size ? { staff_ids: [...copyStaff], audience_label: audienceLabel || undefined } : {}),
      })
      const data = res.data || {}
      toast.success(`Sent to ${data.sent} ${data.sent === 1 ? 'parent' : 'parents'}, each in their own thread`
        + (data.emailed ? `, and emailed ${data.emailed}` : '')
        + (data.staff_sent ? `, with a copy to ${data.staff_sent} staff` : ''))
      if (data.skipped?.length) {
        toast.error(`${data.skipped.length} could not be reached`)
      }
      onSent?.(data)
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send the message')
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    if (toFamilies) return sendToFamilies()
    if (!chosen.size) { toast.error('Choose at least one person'); return }
    if (!body.trim()) { toast.error('Write something to send'); return }
    setBusy(true)
    try {
      const res = await api.post(withOrg('/api/sis/messaging/compose', orgId), {
        recipient_ids: [...chosen],
        mode: separate ? 'separate' : 'group',
        subject: subject.trim() || undefined,
        name: name.trim() || undefined,
        body: body.trim(),
        ...(asSchool ? { as_school: true } : {}),
      })
      const data = res.data || {}
      toast.success(data.mode === 'group'
        ? `Sent to ${data.sent} people in one thread`
        : `Sent ${data.sent} separate message${data.sent === 1 ? '' : 's'}`)
      if (data.skipped?.length) {
        toast.error(`${data.skipped.length} could not be reached`)
      }
      onSent?.(data)
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send the message')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New message"
      size="lg"
      footer={(
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-neutral-500">
            {toFamilies
              ? (chosenFamilies.size
                ? `${chosenFamilies.size} ${chosenFamilies.size === 1 ? 'parent' : 'parents'} · a private thread each`
                  + (copyStaff.size ? ` · copy to ${copyStaff.size} staff` : '')
                : 'No families selected yet')
              : (chosen.size
                ? `${chosen.size} ${chosen.size === 1 ? 'person' : 'people'}${willBeGroup ? ' · one thread' : ''}`
                : 'Nobody selected yet')}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">
              Cancel
            </button>
            <button type="button" onClick={send} disabled={busy || !recipientCount || !body.trim()}
              className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    >
      <div role="group" aria-label="Who to write to"
        className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 mb-4">
        {AUDIENCES.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setAudience(key)} aria-pressed={audience === key}
            className={`px-3 py-1.5 text-sm font-medium rounded-md ${
              audience === key ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-gray-50'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {toFamilies ? (
        <div className="space-y-4">
          <FamilyAudiencePicker orgId={orgId}
            people={families} setPeople={setFamilies}
            selected={chosenFamilies} setSelected={setChosenFamilies}
            onAudienceLabel={setAudienceLabel} />

          <div>
            <span className="block text-xs font-medium text-neutral-600 mb-1">Copy staff (optional)</span>
            <SearchSelect value=""
              onChange={(id) => id && setCopyStaff((prev) => new Set([...prev, id]))}
              options={people.filter((p) => !copyStaff.has(p.id))}
              getId={(p) => p.id} getLabel={nameOf}
              placeholder="Add a teacher or staff member" />
            {copyStaff.size > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[...copyStaff].map((id) => (
                  <span key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2.5 py-1 text-xs text-optio-purple">
                    {nameOf(byId.get(id))}
                    <button type="button" aria-label={`Stop copying ${nameOf(byId.get(id))}`}
                      onClick={() => setCopyStaff((prev) => { const n = new Set(prev); n.delete(id); return n })}
                      className="font-bold hover:text-optio-pink">×</button>
                  </span>
                ))}
              </div>
            )}
            <span className="block text-xs text-neutral-500 mt-1">
              Each gets their own copy from you, marked as a copy. Families do not see who was copied, and their replies still come only to the School Inbox.
            </span>
          </div>

          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={emailToo} className="mt-0.5"
              onChange={(e) => setEmailToo(e.target.checked)} />
            <span>
              Also send by email
              <span className="block text-xs text-neutral-500">
                One copy per mailbox, for parents who do not open the app. Replies still come to the School Inbox.
              </span>
            </span>
          </label>

          <div>
            <label className="block text-xs text-neutral-500 mb-1" htmlFor="family-subject">
              Subject (optional)
            </label>
            <input id="family-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          </div>

          <div>
            <label className="block text-xs text-neutral-500 mb-1" htmlFor="family-body">Message</label>
            <textarea id="family-body" value={body} onChange={(e) => setBody(e.target.value)}
              rows={5} maxLength={2000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          </div>
        </div>
      ) : loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          {presets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-neutral-500">Quick picks</p>
              {/* The few that name a group of the school stay as chips. The
                  per-class ones do not: iCreate has 158 classes, and a chip
                  each buried the handful worth reading behind a wall of them
                  ("the list is too long", 2026-09-22). Those go in a box you
                  type into instead, which is how you find one class anyway. */}
              <div className="flex flex-wrap gap-1.5">
                {groupPresets.map((preset) => (
                  <button key={preset.key} type="button" onClick={() => addPreset(preset)}
                    title={preset.description || undefined}
                    className="px-2.5 py-1 rounded-full border border-gray-300 text-xs text-neutral-700 hover:border-optio-purple hover:text-optio-purple transition-colors">
                    {preset.label}
                    <span className="ml-1 text-neutral-400">{preset.member_ids.length}</span>
                  </button>
                ))}
              </div>
              {classPresets.length > 0 && (
                <SearchSelect
                  value=""
                  onChange={(key) => {
                    const preset = classPresets.find((p) => p.key === key)
                    if (preset) addPreset(preset)
                  }}
                  options={classPresets}
                  getId={(p) => p.key}
                  getLabel={(p) => `${p.label} (${p.member_ids.length})`}
                  placeholder={`Teachers of a class… (${classPresets.length})`}
                />
              )}
            </div>
          )}

          {chosen.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...chosen].map((id) => (
                <span key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2.5 py-1 text-xs text-optio-purple">
                  {nameOf(byId.get(id))}
                  <button type="button" onClick={() => toggle(id)}
                    aria-label={`Remove ${nameOf(byId.get(id))}`}
                    className="font-bold hover:text-optio-pink">×</button>
                </span>
              ))}
              <button type="button" onClick={() => setChosen(new Set())}
                className="text-xs text-neutral-500 hover:underline px-1">Clear</button>
            </div>
          )}

          <PeoplePicker people={people} selected={chosen} onToggle={toggle}
            getLabel={nameOf}
            getSearchText={(p) => `${nameOf(p)} ${(p.role_labels || []).join(' ')}`}
            renderMeta={(p) => ((p.role_labels || []).length > 0 && (
              <span className="block text-xs text-neutral-500 truncate">{p.role_labels.join(', ')}</span>
            ))}
            placeholder="Search staff by name or role" searchLabel="Search staff"
            emptyLabel="Nobody to message here yet." />

          {chosen.size > 1 && (
            <label className="flex items-start gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={separate} className="mt-0.5"
                onChange={(e) => setSeparate(e.target.checked)} />
              <span>
                Send separately
                <span className="block text-xs text-neutral-500">
                  One private message each, instead of one thread everyone can reply in.
                </span>
              </span>
            </label>
          )}

          {willBeGroup && (
            <div>
              <label className="block text-xs text-neutral-500 mb-1" htmlFor="staff-group-name">
                Name this thread (optional)
              </label>
              <input id="staff-group-name" value={name} onChange={(e) => setName(e.target.value)}
                maxLength={100} placeholder="Tuesday cover"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
            </div>
          )}

          <div>
            <label className="block text-xs text-neutral-500 mb-1" htmlFor="staff-subject">
              Subject (optional)
            </label>
            <input id="staff-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          </div>

          <div>
            <label className="block text-xs text-neutral-500 mb-1" htmlFor="staff-body">Message</label>
            <textarea id="staff-body" value={body} onChange={(e) => setBody(e.target.value)}
              rows={5} maxLength={2000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          </div>
        </div>
      )}
    </Modal>
  )
}
