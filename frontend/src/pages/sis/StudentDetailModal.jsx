import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import ModalOverlay from '../../components/ui/ModalOverlay'
import SearchSelect from '../../components/ui/SearchSelect'
import { switchSurfaceInApp } from '../../utils/appSurface'

/**
 * Tabbed per-student management modal.
 *   Profile  — details (name/email/DOB) + status/grade, family, emergency contacts, account actions
 *   Schedule — the student's active classes (teacher + link to the class's quest), plus enroll
 *   Message  — message the student through the platform messaging system
 * The Profile "Save" lives in the header so the modal doesn't grow taller.
 */

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'message', label: 'Message' },
]

const StudentDetailModal = ({ student, orgId, onClose, onSaved }) => {
  const isStudent = student.is_student !== false
  const [tab, setTab] = useState('profile')
  const [form, setForm] = useState({
    role: student.role || (isStudent ? 'student' : ''),
    first_name: student.first_name || '',
    last_name: student.last_name || '',
    email: student.email || '',
    date_of_birth: student.date_of_birth || '',
    status: student.enrollment_status === 'unassigned' ? 'enrolled' : student.enrollment_status,
    grade_level: student.grade_level || '',
  })
  const [saving, setSaving] = useState(false)
  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const saveProfile = async () => {
    setSaving(true)
    try {
      const reqs = [api.patch(`/api/sis/students/${student.student_id}`, {
        first_name: form.first_name, last_name: form.last_name,
        email: form.email || null, date_of_birth: form.date_of_birth || null, organization_id: orgId,
      })]
      if (form.role) {
        reqs.push(api.patch(`/api/sis/users/${student.student_id}/role`, { role: form.role, organization_id: orgId }))
      }
      if (isStudent) {
        reqs.push(api.patch(`/api/sis/enrollments/${student.student_id}`, {
          status: form.status, grade_level: form.grade_level, organization_id: orgId,
        }))
      }
      await Promise.all(reqs)
      toast.success('Saved')
      onSaved?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save')
    } finally { setSaving(false) }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 pb-3 border-b border-gray-100 gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-neutral-900 truncate">{student.name}</h2>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {tab === 'profile' && <Button size="sm" onClick={saveProfile} loading={saving}>Save</Button>}
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="flex gap-1 px-4 pt-3 border-b border-gray-100">
          {TABS.filter((t) => t.key !== 'schedule' || isStudent).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
                tab === t.key ? 'border-optio-purple text-optio-purple' : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto">
          {tab === 'profile' && (
            <div className="space-y-5">
              <ProfileFields form={form} set={setField} isStudent={isStudent} />
              {isStudent && <FamilySection student={student} orgId={orgId} onSaved={onSaved} />}
              {isStudent && <ContactsSection student={student} orgId={orgId} />}
              <AccountSection student={student} orgId={orgId} onSaved={onSaved} onClose={onClose} />
            </div>
          )}
          {tab === 'schedule' && isStudent && <SchedulePanel student={student} orgId={orgId} />}
          {tab === 'message' && <MessagePanel student={student} orgId={orgId} />}
        </div>
      </div>
    </ModalOverlay>
  )
}

const RoleField = ({ form, set }) => (
  <label className="text-xs text-neutral-500">Role
    <select value={form.role} onChange={(e) => set('role', e.target.value)} className={field}>
      {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </label>
)

const ProfileFields = ({ form, set, isStudent }) => (
  <section className="space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs text-neutral-500">First name
        <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className={field} />
      </label>
      <label className="text-xs text-neutral-500">Last name
        <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={field} />
      </label>
    </div>
    <label className="text-xs text-neutral-500 block">Email
      <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={field} />
    </label>
    {isStudent ? (
      <div className="grid grid-cols-3 gap-3">
        <label className="text-xs text-neutral-500">Date of birth
          <input type="date" value={form.date_of_birth || ''} onChange={(e) => set('date_of_birth', e.target.value)} className={field} />
        </label>
        <RoleField form={form} set={set} />
        <label className="text-xs text-neutral-500">Grade
          <input value={form.grade_level} onChange={(e) => set('grade_level', e.target.value)} className={field} placeholder="e.g. 9th" />
        </label>
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500">Date of birth
          <input type="date" value={form.date_of_birth || ''} onChange={(e) => set('date_of_birth', e.target.value)} className={field} />
        </label>
        <RoleField form={form} set={set} />
      </div>
    )}
    <p className="text-xs text-neutral-400 -mt-1">Changing the email updates the user's login.</p>
  </section>
)

const ROLE_OPTIONS = [
  ['student', 'Student'], ['parent', 'Parent'], ['advisor', 'Teacher'], ['org_admin', 'Admin'], ['observer', 'Observer'],
]

const AccountSection = ({ student, orgId, onSaved, onClose }) => {
  const resetPassword = async () => {
    if (!window.confirm(`Reset ${student.name}'s password?`)) return
    try {
      const r = await api.post(`/api/admin/organizations/${orgId}/users/${student.student_id}/reset-password`, {})
      const pw = r.data?.new_password || r.data?.password
      toast.success(pw ? `New password: ${pw}` : (r.data?.message || 'Password reset'), { duration: pw ? 10000 : 4000 })
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not reset password') }
  }
  const remove = async () => {
    if (!window.confirm(`Remove ${student.name} from this organization? Their account becomes a platform account (not deleted).`)) return
    try {
      await api.post(`/api/admin/organizations/${orgId}/users/remove`, { user_id: student.student_id })
      toast.success(`${student.name} removed from the organization`)
      onSaved?.(); onClose?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not remove student') }
  }
  return (
    <section className="border-t border-gray-100 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Account</h4>
      <div className="flex flex-wrap items-center gap-4">
        <Button size="sm" variant="outline" onClick={resetPassword}>Reset password</Button>
        <button onClick={remove} className="text-sm text-red-600 font-medium hover:underline">Remove from organization</button>
      </div>
    </section>
  )
}

const FamilySection = ({ student, orgId, onSaved }) => {
  const [households, setHouseholds] = useState([])
  const [loading, setLoading] = useState(true)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get(`/api/sis/households?organization_id=${orgId}`)
      .then((r) => setHouseholds(r.data?.households || []))
      .catch(() => { /* non-fatal */ })
      .finally(() => setLoading(false))
  }, [orgId])

  const assign = async () => {
    if (!chosen) { toast.error('Pick a family'); return }
    setBusy(true)
    try {
      await api.post(`/api/sis/households/${chosen}/members`, {
        user_id: student.student_id, relationship: 'student', organization_id: orgId,
      })
      toast.success('Added to family')
      onSaved?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not assign') }
    finally { setBusy(false) }
  }

  return (
    <section className="border-t border-gray-100 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Family</h4>
      {student.household_name
        ? <p className="text-sm text-neutral-600 mb-2">In <span className="font-medium">{student.household_name}</span>. Assigning another moves them.</p>
        : <p className="text-sm text-neutral-400 mb-2">Not in a family yet.</p>}
      {loading ? <p className="text-sm text-neutral-400">Loading…</p>
        : households.length === 0 ? <p className="text-sm text-neutral-400">No families yet — create one on the Families page.</p>
        : (
          <div className="flex gap-2">
            <SearchSelect
              value={chosen} onChange={setChosen} options={households}
              getId={(h) => h.id} getLabel={(h) => h.name}
              placeholder="Search families…" className="flex-1"
            />
            <Button size="sm" onClick={assign} loading={busy}>Assign</Button>
          </div>
        )}
    </section>
  )
}

const ContactsSection = ({ student, orgId }) => {
  const [contacts, setContacts] = useState([])
  const [adding, setAdding] = useState(false)
  const [nc, setNc] = useState({ name: '', relationship: '', phone: '', email: '' })

  const reload = useCallback(() => {
    api.get(`/api/sis/students/${student.student_id}/emergency-contacts`)
      .then((r) => setContacts(r.data?.contacts || []))
      .catch(() => { /* non-fatal */ })
  }, [student.student_id])

  useEffect(() => { reload() }, [reload])

  const copyFromFamily = async () => {
    try {
      const r = await api.post(`/api/sis/students/${student.student_id}/emergency-contacts/copy-from-family`, {})
      if (r.data?.no_family) { toast.error('Student is not in a family'); return }
      const n = r.data?.copied ?? 0
      toast.success(n ? `Copied ${n} contact${n === 1 ? '' : 's'} from family` : 'No new family contacts to copy')
      if (n) reload()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not copy from family') }
  }

  const add = async () => {
    if (!nc.name.trim()) { toast.error('Contact name required'); return }
    try {
      const r = await api.post(`/api/sis/students/${student.student_id}/emergency-contacts`, { ...nc, organization_id: orgId })
      setContacts((c) => [...c, r.data.contact])
      setNc({ name: '', relationship: '', phone: '', email: '' })
      setAdding(false)
    } catch { toast.error('Could not add contact') }
  }
  const remove = async (c) => {
    if (!window.confirm(`Remove ${c.name} as an emergency contact?`)) return
    try { await api.delete(`/api/sis/emergency-contacts/${c.id}`); setContacts((x) => x.filter((y) => y.id !== c.id)) }
    catch { toast.error('Could not remove contact') }
  }

  return (
    <section className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Emergency contacts</h4>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-sm text-optio-purple font-medium hover:underline">+ Emergency Contact</button>
        )}
      </div>
      <div className="space-y-2">
        {contacts.length === 0 && !adding && <p className="text-sm text-neutral-400">No contacts yet.</p>}
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2">
            <div className="text-sm">
              <span className="font-medium text-neutral-800">{c.name}</span>
              {c.relationship && <span className="text-neutral-400"> · {c.relationship}</span>}
              <div className="text-xs text-neutral-400">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
            </div>
            <button onClick={() => remove(c)} className="text-red-500 text-sm hover:underline">Remove</button>
          </div>
        ))}
      </div>
      {adding && (
        <div className="mt-2 rounded-lg border border-gray-200 p-3">
          {student.household_name && (
            <button onClick={copyFromFamily} className="text-sm text-optio-purple font-medium hover:underline mb-2">Copy from family</button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className={field} placeholder="Name" autoFocus />
            <input value={nc.relationship} onChange={(e) => setNc({ ...nc, relationship: e.target.value })} className={field} placeholder="Relationship" />
            <input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} className={field} placeholder="Phone" />
            <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} className={field} placeholder="Email" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={add}>Add contact</Button>
            <button onClick={() => { setAdding(false); setNc({ name: '', relationship: '', phone: '', email: '' }) }} className="text-sm text-neutral-500 hover:underline">Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}

// ── Schedule: active classes + teacher + quest link, plus enroll ──────────────
const SchedulePanel = ({ student, orgId }) => {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [all, setAll] = useState([])
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    api.get(`/api/sis/students/${student.student_id}/classes?organization_id=${orgId}`)
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => toast.error('Could not load schedule'))
      .finally(() => setLoading(false))
  }, [student.student_id, orgId])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    api.get(`/api/sis/classes?organization_id=${orgId}`).then((r) => setAll(r.data?.classes || [])).catch(() => {})
  }, [orgId])

  const enroll = async () => {
    if (!chosen) { toast.error('Pick a class'); return }
    setBusy(true)
    try {
      const r = await api.post(`/api/sis/classes/${chosen}/enrollments`, { student_user_id: student.student_id })
      toast.success(r.data?.already_enrolled ? 'Already enrolled' : 'Enrolled in class')
      setChosen('')
      reload()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not enroll') }
    finally { setBusy(false) }
  }

  const enrolledIds = new Set(classes.map((c) => c.class_id))
  const options = all.filter((c) => !enrolledIds.has(c.id))

  return (
    <div className="space-y-4">
      {loading ? <p className="text-sm text-neutral-500">Loading…</p>
        : classes.length === 0 ? <p className="text-sm text-neutral-400">Not enrolled in any classes yet.</p>
        : (
          <div className="space-y-2">
            {classes.map((c) => (
              <div key={c.class_id} className="rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="font-medium text-neutral-900">{c.name}</div>
                <div className="text-sm text-neutral-500">{c.teacher_name ? `Teacher: ${c.teacher_name}` : 'No teacher assigned'}</div>
                {c.quest_id
                  ? <button onClick={() => switchSurfaceInApp('learning', `/quests/${c.quest_id}`)} className="text-sm text-optio-purple font-medium hover:underline">
                      Open quest{c.quest_title ? `: ${c.quest_title}` : ''} →
                    </button>
                  : <span className="text-xs text-neutral-400">No quest linked</span>}
              </div>
            ))}
          </div>
        )}

      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Enroll in a class</h4>
        {options.length === 0
          ? <p className="text-sm text-neutral-400">No other classes available.</p>
          : (
            <div className="flex gap-2">
              <SearchSelect
                value={chosen} onChange={setChosen} options={options}
                getId={(c) => c.id}
                getLabel={(c) => `${c.name}${c.capacity != null ? ` (${c.enrolled_count}/${c.capacity})` : ''}`}
                placeholder="Search classes…" className="flex-1"
              />
              <Button size="sm" onClick={enroll} loading={busy}>Enroll</Button>
            </div>
          )}
      </div>
    </div>
  )
}

// ── Message (platform messaging / direct messages) ────────────────────────────
const MessagePanel = ({ student, orgId }) => {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!body.trim()) { toast.error('Write a message'); return }
    setSending(true)
    try {
      await api.post(`/api/sis/students/${student.student_id}/message`, { subject, body, organization_id: orgId })
      toast.success('Message sent')
      setSubject(''); setBody('')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not send message')
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">Sends a message to {student.name} through Messages.</p>
      <label className="text-xs text-neutral-500 block">Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} placeholder="Optional" />
      </label>
      <label className="text-xs text-neutral-500 block">Message
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={`${field} resize-none`} />
      </label>
      <Button size="sm" onClick={send} loading={sending}>Send</Button>
    </div>
  )
}

export default StudentDetailModal
