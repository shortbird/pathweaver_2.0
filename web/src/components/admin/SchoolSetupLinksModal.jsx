import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { Modal } from '../ui/Modal'
import { INPUT_CLASS } from '../ui/Input'
import { queryKeys } from '../../utils/queryKeys'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * Superadmin: single-use links that let a new school's operator create their
 * own org (routes/school_onboarding.py). Make one, copy it into an email, and
 * read the operator's answers here once they submit. The answers that are not
 * settings (the features they want, tuition, launch date) only live here.
 */

const STATUS_STYLE = {
  open: 'bg-green-100 text-green-700',
  used: 'bg-blue-100 text-blue-700',
  expired: 'bg-gray-100 text-gray-600',
  revoked: 'bg-gray-100 text-gray-600',
}

// The answer keys in the order the form asks them, with readable names.
const ANSWER_LABELS = [
  ['school_name', 'School'], ['contact_title', 'Role'], ['contact_phone', 'Phone'],
  ['online_only', 'Online only'], ['address', 'Address'], ['city', 'City'], ['region', 'State'],
  ['country', 'Country'], ['timezone', 'Time zone'],
  ['student_count', 'Students now'], ['grade_counts', 'By grade'], ['has_logo', 'Logo'], ['website', 'Website'], ['mission', 'Mission'],
  ['school_type', 'Type'], ['teaching_approach', 'Approach'], ['days_per_week', 'Days per week'],
  ['term_structure', 'Terms'], ['year_start', 'Year starts'], ['year_end', 'Year ends'],
  ['staff_count', 'Staff'], ['students_next_year', 'Students next year'], ['current_tools', 'Tools now'],
  ['features', 'Interested in'], ['accreditation', 'Accreditation'],
  ['optio_credit_interest', 'Optio credit'], ['tuition_model', 'Tuition'], ['funding_programs', 'Funding'],
  ['has_stripe', 'Has Stripe'], ['billing_contact_name', 'Billing contact'],
  ['billing_contact_email', 'Billing email'], ['ai_choice', 'AI'], ['library_choice', 'Library'],
  ['launch_date', 'Launch'], ['referral_source', 'Heard from'], ['notes', 'Notes'],
]

function show(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ')
  }
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return String(value)
}

function Answers({ answers }) {
  const rows = ANSWER_LABELS.filter(([k]) => answers?.[k] !== undefined && answers[k] !== '')
  if (!rows.length) return null
  return (
    <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, label]) => (
        <React.Fragment key={k}>
          <dt className="text-gray-500">{label}</dt>
          <dd className="text-gray-900 break-words">{show(answers[k])}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

export default function SchoolSetupLinksModal({ onClose }) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const EMPTY = { school_name_hint: '', contact_email: '', note: '', start_modules: [] }
  const [draft, setDraft] = useState(EMPTY)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.schoolSetupLinks(),
    queryFn: async () => (await api.get('/api/admin/school-setup-links')).data,
  })
  const links = data?.links || []
  // Features the link turns on when the school is created (a new school
  // otherwise starts with only the basics).
  const startOptions = data?.start_module_options || []
  const toggleStart = (key) => setDraft((d) => ({
    ...d,
    start_modules: d.start_modules.includes(key)
      ? d.start_modules.filter((k) => k !== key) : [...d.start_modules, key],
  }))
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.schoolSetupLinks() })

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }

  const create = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      const { data } = await api.post('/api/admin/school-setup-links', draft)
      setDraft(EMPTY)
      await copy(data.link.url)
      refresh()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not make the link')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (link) => {
    if (!(await confirm(`Turn off the link for ${link.school_name_hint || 'this school'}?`))) return
    try {
      await api.post(`/api/admin/school-setup-links/${link.id}/revoke`, {})
      refresh()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not turn the link off')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="School setup links" size="lg">
      <p className="text-sm text-gray-600 mb-4">
        Send a link to a school&apos;s operator. They create their own account, answer the setup form, and the
        school is created with them as its administrator. Each link works once and lasts 30 days.
      </p>

      <form onSubmit={create} className="grid sm:grid-cols-2 gap-3 mb-6">
        <input className={INPUT_CLASS} placeholder="School name (fills the form's first box)"
          value={draft.school_name_hint} onChange={(e) => setDraft({ ...draft, school_name_hint: e.target.value })} />
        <input className={INPUT_CLASS} placeholder="Who you are sending it to (email, for your records)"
          value={draft.contact_email} onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })} />
        <input className={`${INPUT_CLASS} sm:col-span-2`} placeholder="Note (only you see it)"
          value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        {startOptions.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="text-sm text-gray-600 mb-1">Turn on when the school is created (optional)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {startOptions.map((o) => (
                <label key={o.key} className="flex items-center gap-1.5 text-sm text-gray-800 cursor-pointer">
                  <input type="checkbox" checked={draft.start_modules.includes(o.key)}
                    onChange={() => toggleStart(o.key)} className="h-4 w-4 accent-purple-700" />
                  {o.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="sm:col-span-2">
          <button type="submit" disabled={creating} className="btn-primary">
            {creating ? 'Making the link...' : 'Make a link and copy it'}
          </button>
        </div>
      </form>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : !links.length ? (
        <p className="text-sm text-gray-500">No links yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {links.map((link) => (
            <li key={link.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">
                  {link.answers?.school_name || link.school_name_hint || 'Unnamed school'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[link.status]}`}>
                  {link.status}
                </span>
                {link.contact_email && <span className="text-xs text-gray-500">{link.contact_email}</span>}
                <span className="text-xs text-gray-400">{new Date(link.created_at).toLocaleDateString()}</span>
                <div className="ml-auto flex gap-3 text-sm">
                  {link.status === 'open' && (
                    <>
                      <button onClick={() => copy(link.url)} className="text-optio-purple hover:underline">Copy link</button>
                      <button onClick={() => revoke(link)} className="text-red-600 hover:underline">Turn off</button>
                    </>
                  )}
                  {link.status === 'used' && (
                    <>
                      <button onClick={() => setOpenId(openId === link.id ? null : link.id)}
                        className="text-optio-purple hover:underline">
                        {openId === link.id ? 'Hide answers' : 'Answers'}
                      </button>
                      {link.organization_id && (
                        <a href={`/admin/organizations/${link.organization_id}`} className="text-optio-purple hover:underline">
                          Open school
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
              {link.note && <p className="mt-1 text-xs text-gray-500">{link.note}</p>}
              {link.answers?.start_modules?.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Turns on: {link.answers.start_modules
                    .map((k) => startOptions.find((o) => o.key === k)?.name || k).join(', ')}
                </p>
              )}
              {openId === link.id && <Answers answers={link.answers} />}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
