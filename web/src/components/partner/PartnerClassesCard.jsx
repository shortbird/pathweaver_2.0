import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../contexts/ConfirmContext'
import {
  useAddPartnerStudent,
  usePartnerOfferings,
  useRemovePartnerStudent,
} from '../../hooks/api/usePartnerOfferings'

/**
 * A credit-class partner's classes, on its organization page.
 *
 * For each class: the link to give buyers, an "Add a student" form for
 * orders the partner enters by hand, and the students who have the class.
 * Renders nothing for an org that sells no class. Backend:
 * routes/partner_offerings.py.
 */
export default function PartnerClassesCard({ orgId }) {
  const { data: offerings = [] } = usePartnerOfferings(orgId, { retry: false })
  if (!offerings.length) return null
  return (
    <div className="space-y-6 mb-6">
      {offerings.map(o => <OfferingPanel key={o.id} orgId={orgId} offering={o} />)}
    </div>
  )
}

function OfferingPanel({ orgId, offering }) {
  const [adding, setAdding] = useState(false)
  const remove = useRemovePartnerStudent(orgId)
  const confirm = useConfirm()
  const active = offering.students.filter(s => !s.removed_at)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(offering.link)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy. Select the link and copy it.')
    }
  }

  const removeStudent = async (student) => {
    if (!(await confirm(`Remove ${student.name}? You stop paying for them. Their class and work stay on their account.`))) return
    try {
      await remove.mutateAsync({ offeringId: offering.id, enrollmentId: student.enrollment_id })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove the student')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{offering.title}</h2>
          <p className="text-sm text-gray-500">
            {offering.subject_name} class · {active.length} {active.length === 1 ? 'student' : 'students'}
          </p>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-primary rounded-lg hover:opacity-90 self-start"
        >
          {adding ? 'Close' : 'Add a student'}
        </button>
      </div>

      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={`link-${offering.id}`}>
        Link for your buyers
      </label>
      <div className="flex gap-2 mb-1">
        <input
          id={`link-${offering.id}`}
          readOnly
          value={offering.link}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 rounded-lg border-gray-300 text-sm bg-gray-50"
        />
        <button
          onClick={copyLink}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Copy
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        A student opens this link, creates an account or signs in, and the class appears in their classes.
      </p>

      {adding && <AddStudentForm orgId={orgId} offering={offering} onDone={() => setAdding(false)} />}

      {offering.students.length === 0 ? (
        <p className="text-sm text-gray-500">No students yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-4 font-medium">Student</th>
                <th className="py-2 pr-4 font-medium">Joined</th>
                <th className="py-2 pr-4 font-medium">Progress</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {offering.students.map(s => (
                <tr key={s.enrollment_id} className="border-b border-gray-50">
                  <td className="py-2 pr-4">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-500">{s.email}</div>
                  </td>
                  <td className="py-2 pr-4 text-gray-600">
                    {s.joined_at ? new Date(s.joined_at).toLocaleDateString() : ''}
                  </td>
                  <td className="py-2 pr-4 text-gray-600">{s.xp} / {offering.target_xp} XP</td>
                  <td className="py-2 pr-4 text-gray-600">{statusLabel(s)}</td>
                  <td className="py-2 text-right">
                    {!s.removed_at && (
                      <button
                        onClick={() => removeStudent(s)}
                        className="text-xs text-gray-500 hover:text-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function statusLabel(student) {
  if (student.removed_at) return 'Removed'
  if (student.review_status === 'credit_awarded') return 'Credit awarded'
  if (student.review_status) return 'In review'
  return 'Working'
}

const emptyForm = { first_name: '', last_name: '', email: '', date_of_birth: '' }

function AddStudentForm({ orgId, offering, onDone }) {
  const [form, setForm] = useState(emptyForm)
  const [choices, setChoices] = useState(null) // students behind an existing address
  const [studentId, setStudentId] = useState('')
  const [error, setError] = useState(null)
  const add = useAddPartnerStudent(orgId)

  const set = (key) => (e) => {
    setForm(f => ({ ...f, [key]: e.target.value }))
    if (key === 'email') { setChoices(null); setStudentId('') }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const result = await add.mutateAsync({
        offeringId: offering.id,
        body: { ...form, ...(studentId ? { student_id: studentId } : {}) },
      })
      const name = result.student?.name || `${form.first_name} ${form.last_name}`
      if (!result.created) toast.success(`${name} already has this class`)
      else if (result.is_new_account) {
        toast.success(result.email_sent
          ? `${name} was added. They got an email to set their password.`
          : `${name} was added, but the email did not send. Ask them to use "Forgot password" with ${form.email}.`)
      } else toast.success(`The class was added to ${name}'s account`)
      setForm(emptyForm)
      setChoices(null)
      setStudentId('')
      onDone()
    } catch (err) {
      const data = err.response?.data || {}
      if (data.code === 'existing_account' && data.students?.length) {
        setChoices(data.students)
        setError(data.error)
      } else {
        setError(data.error || 'Could not add the student')
      }
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-100 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="ps-first" label="First name" value={form.first_name} onChange={set('first_name')} required />
        <Field id="ps-last" label="Last name" value={form.last_name} onChange={set('last_name')} required />
        <Field id="ps-email" label="Student email" type="email" value={form.email} onChange={set('email')} required />
        <Field id="ps-dob" label="Date of birth" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
      </div>
      <p className="text-xs text-gray-500">
        Students must be 13 or older. The date of birth is required for a new account.
      </p>

      {choices && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-gray-700">Who is the class for?</legend>
          {choices.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="ps-student" value={c.id} checked={studentId === c.id}
                onChange={() => setStudentId(c.id)} />
              {c.name}{c.relationship === 'child' ? ' (child on this account)' : ''}
            </label>
          ))}
        </fieldset>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={add.isPending || (choices && !studentId)}
        className="px-4 py-2 text-sm font-medium text-white bg-gradient-primary rounded-lg hover:opacity-90 disabled:opacity-50"
      >
        {add.isPending ? 'Adding...' : 'Add student'}
      </button>
    </form>
  )
}

function Field({ id, label, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input id={id} {...props} className="block w-full rounded-lg border-gray-300 text-sm focus:border-optio-purple focus:ring-optio-purple" />
    </div>
  )
}
