import React, { useState, useEffect, useContext } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCreateBounty, useBountyDetail } from '../hooks/api/useBounties'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../utils/queryKeys'
import api from '../services/api'
import { isStaffUser } from '../utils/userRoles'
import { fetchFamilyChildren } from '../hooks/api/useFamilyChildren'
import toast from 'react-hot-toast'
import { PageLoader } from '../components/ui/Spinner'
import BountyAiDraftPanel from '../components/bounty/BountyAiDraftPanel'
import useHidePillars from '../hooks/useHidePillars'
import { getAppSurface } from '../utils/appSurface'
import { OrganizationContext } from '../contexts/OrganizationContext'
import { moduleEnabled } from '../modules/moduleEnabled'

const PILLARS = [
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Communication' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
]

// Who can take a bounty on, in the order a newcomer should read them: the
// narrowest audience first. "Everyone on Optio" is last on purpose -- it is the
// one a school almost never means.
const VISIBILITY_OPTIONS = [
  { key: 'organization', label: 'My school', desc: 'Students at your school.' },
  { key: 'family', label: 'Students linked to me', desc: 'Your own children and the students linked to your account.' },
  { key: 'public', label: 'Everyone on Optio', desc: 'Any student on Optio can find it and take it on.' },
]

const fieldCls = (hasError) => `input-field ${hasError ? 'border-red-500' : ''}`

/** One numbered part of the form: a title and, under it, what it is for. */
const Section = ({ step, title, hint, children }) => (
  <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6">
    <div className="flex items-start gap-3 mb-4">
      {step && (
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-optio-purple/10 text-sm font-semibold text-optio-purple">
          {step}
        </span>
      )}
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {hint && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}
      </div>
    </div>
    <div className="space-y-4">{children}</div>
  </section>
)

/** An on/off switch with its label and one line of explanation. */
const Toggle = ({ id, label, hint, checked, onChange, children }) => (
  <div>
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {hint && <span className="block text-sm text-gray-500">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${checked ? 'bg-optio-purple' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
    {checked && children && <div className="mt-3">{children}</div>}
  </div>
)

const RemoveButton = ({ onClick, label }) => (
  <button type="button" onClick={onClick} aria-label={label}
    className="p-2 text-gray-400 hover:text-red-500 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center">
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
)

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const OPTIO_LOGO = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'
const OPTIO_USERS = ['tanner bowman']

const BountyCreatePage = () => {
  const hidePillars = useHidePillars()
  // School points (sis_points_service) are a reward only at a school that
  // runs them. Read the context directly: the platform side has no provider.
  const { organization } = useContext(OrganizationContext) || {}
  const offerPoints = Boolean(organization) && moduleEnabled(organization, 'points')
  const navigate = useNavigate()
  const location = useLocation()
  // The bounty board passes its own URL as state.from -- it may be embedded in
  // the org management page (/admin/organizations/:id?tab=bounties), so "back"
  // should return there rather than always to /bounties.
  const backTo = location.state?.from || '/bounties'
  const { bountyId } = useParams()
  const isEdit = !!bountyId
  const { user } = useAuth()

  const createMutation = useCreateBounty()
  const { data: existingBounty, isLoading: loadingBounty } = useBountyDetail(bountyId, { enabled: isEdit })

  const queryClient = useQueryClient()
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }) => {
      const response = await api.put(`/api/bounties/${id}`, data)
      return response.data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.myPosted })
      toast.success('Bounty updated!')
      navigate(backTo)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update bounty')
    },
  })

  // Parents and observers almost always mean "for my kids" — default them to
  // family visibility so a missed radio button doesn't broadcast a chore to
  // the whole platform. Teachers/org admins/superadmin keep the public default.
  const posterRole = user?.role === 'org_managed'
    ? (user?.org_roles?.[0] || user?.org_role)
    : user?.role
  // In the SIS console a bounty is the school's (its Bounties block): a chore
  // posted there must not reach the whole platform by default.
  const defaultVisibility = (posterRole === 'parent' || posterRole === 'observer')
    ? 'family'
    : (getAppSurface() === 'sis' && user?.organization_id ? 'organization' : 'public')

  // The route itself is only auth-gated; a student who deep-links here used to
  // fill in the whole form and learn about the 403 from a red toast at the end.
  useEffect(() => {
    if (posterRole === 'student' && user?.role !== 'superadmin') {
      toast.error('Only parents, teachers, and admins can post bounties')
      navigate('/bounties', { replace: true })
    }
  }, [posterRole, user?.role, navigate])

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    max_participants: 0,
    repeatable: false,
    requires_evidence: true,
    visibility: defaultVisibility,
    cohort_class_id: '', // optional: limit a bounty to one cohort/class
    deadline: '', // optional; empty = backend default (one year out)
  })
  // Deliverables keep their id through an edit: claims key completed-state and
  // evidence on these ids, so regenerating them wiped every claimant's progress.
  const [deliverables, setDeliverables] = useState([{ id: null, text: '' }])
  const [rewards, setRewards] = useState([])
  const [errors, setErrors] = useState({})
  const [dependents, setDependents] = useState([])
  const [selectedKids, setSelectedKids] = useState([]) // empty = all kids
  const [cohorts, setCohorts] = useState([]) // org classes (cohorts) for optional restriction
  // "0 = no limit" read as jargon; the limit is a switch with a number under it.
  const [limitClaims, setLimitClaims] = useState(false)

  // Fetch dependents + linked students for family visibility.
  //
  // All three reads are PROBES: this page has no idea whether the person on it
  // is a parent, an observer, or neither, so it asks all three and keeps
  // whatever answers. "You may not read this" is the answer for two of them for
  // almost everyone, and each branch already handles it -- but the axios
  // interceptor reported every one to Sentry as a 403 regression, so an advisor
  // opening this form filed a bug report against a working page (OPTIO-WEB-13).
  // expect403 marks the refusal as the expected answer it is; a 5xx here is
  // still reported.
  useEffect(() => {
    const fetchChildren = async () => {
      const allKids = []
      const seenIds = new Set()

      // The parent's own children -- dependents and linked students -- from
      // the one fetch every parent surface shares (hooks/api/useFamilyChildren).
      // It already handles "not a parent" as an empty list.
      try {
        for (const child of await fetchFamilyChildren()) {
          if (!seenIds.has(child.id)) {
            allKids.push({ id: child.id, display_name: child.name })
            seenIds.add(child.id)
          }
        }
      } catch {
        // Not a parent or no children
      }

      // Fetch linked students (13+ and advisor-linked) from observer links
      try {
        const res = await api.get('/api/observers/my-students', { expect403: true })
        for (const link of (res.data.students || [])) {
          const kidId = link.student_id || link.id
          const info = link.student || {}
          if (kidId && !seenIds.has(kidId)) {
            const name = info.display_name || `${info.first_name || ''} ${info.last_name || ''}`.trim() || 'Student'
            allKids.push({ id: kidId, display_name: name })
            seenIds.add(kidId)
          }
        }
      } catch {
        // No linked students
      }

      setDependents(allKids)
    }
    fetchChildren()
  }, [])

  // Fetch the org's cohorts (classes) so a bounty can optionally be limited to one.
  // Only staff can list these, so only staff ask: a parent posting a bounty
  // (the board sends them here) got a 403 on every visit, swallowed here and
  // paged to Sentry anyway (OPTIO-WEB-26, 2026-09-16).
  useEffect(() => {
    if (!user?.organization_id || !isStaffUser(user)) return
    api.get(`/api/organizations/${user.organization_id}/classes`, { expect403: true })
      .then(res => setCohorts(res.data?.classes || []))
      .catch(() => setCohorts([]))
  }, [user])

  // Populate form when editing
  useEffect(() => {
    if (!existingBounty) return
    setFormData({
      title: existingBounty.title || '',
      description: existingBounty.description || '',
      max_participants: existingBounty.max_participants || 0,
      repeatable: Boolean(existingBounty.repeatable),
      requires_evidence: existingBounty.requires_evidence !== false,
      visibility: existingBounty.visibility || 'public',
      cohort_class_id: existingBounty.cohort_class_id || '',
      deadline: existingBounty.deadline ? existingBounty.deadline.slice(0, 10) : '',
    })
    setLimitClaims((existingBounty.max_participants || 0) > 0)
    const dels = (existingBounty.deliverables || []).map(d => (
      typeof d === 'string' ? { id: null, text: d } : { id: d.id || null, text: d.text || '' }
    ))
    setDeliverables(dels.length > 0 ? dels : [{ id: null, text: '' }])

    const existingRewards = existingBounty.rewards || []
    if (existingRewards.length > 0) {
      setRewards(existingRewards.map(r => ({
        type: r.type,
        value: r.value || 50,
        pillar: r.pillar || 'stem',
        text: r.text || '',
      })))
    } else if (existingBounty.xp_reward) {
      setRewards([{ type: 'xp', value: existingBounty.xp_reward, pillar: existingBounty.pillar || 'stem', text: '' }])
    } else {
      setRewards([])
    }

    // Populate selected kids from existing bounty
    const allowed = existingBounty.allowed_student_ids
    if (allowed && Array.isArray(allowed) && allowed.length > 0) {
      setSelectedKids(allowed)
    } else {
      setSelectedKids([])
    }
  }, [existingBounty])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  // Deliverables
  const addDeliverable = () => setDeliverables(prev => [...prev, { id: null, text: '' }])
  const updateDeliverable = (i, val) => {
    setDeliverables(prev => prev.map((d, idx) => idx === i ? { ...d, text: val } : d))
    if (errors.deliverables) setErrors(prev => ({ ...prev, deliverables: null }))
  }
  const removeDeliverable = (i) => {
    if (deliverables.length <= 1) return
    setDeliverables(prev => prev.filter((_, idx) => idx !== i))
  }

  // Rewards
  const addReward = (type) => {
    if (type === 'xp') {
      setRewards(prev => [...prev, { type: 'xp', value: 50, pillar: 'stem', text: '' }])
    } else if (type === 'points') {
      setRewards(prev => [...prev, { type: 'points', value: 10, pillar: '', text: '' }])
    } else {
      setRewards(prev => [...prev, { type: 'custom', value: 0, pillar: '', text: '' }])
    }
    if (errors.rewards) setErrors(prev => ({ ...prev, rewards: null }))
  }
  const updateReward = (i, field, val) => {
    setRewards(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
    if (errors.rewards) setErrors(prev => ({ ...prev, rewards: null }))
  }
  const removeReward = (i) => {
    setRewards(prev => prev.filter((_, idx) => idx !== i))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.title.trim()) newErrors.title = 'Give the bounty a name'
    if (!formData.description.trim()) newErrors.description = 'Tell students what to do'
    const nonEmptyDels = deliverables.filter(d => d.text.trim())
    if (nonEmptyDels.length === 0) newErrors.deliverables = 'Add at least one step'

    // Flag broken rewards instead of silently dropping them at submit — a
    // parent who typed 20 XP used to have that reward vanish with no message.
    const totalXp = rewards.filter(r => r.type === 'xp').reduce((sum, r) => sum + (r.value || 0), 0)
    if (totalXp > 200) newErrors.rewards = 'Total XP cannot exceed 200'
    else if (rewards.some(r => r.type === 'xp' && (!r.pillar || r.value < 25 || r.value > 200))) {
      newErrors.rewards = 'Each XP reward needs a pillar and a value between 25 and 200'
    } else if (rewards.some(r => r.type === 'custom' && !r.text.trim())) {
      newErrors.rewards = 'Describe the prize, or remove the empty one'
    } else if (rewards.some(r => r.type === 'points' && (r.value < 1 || r.value > 1000))) {
      newErrors.rewards = 'Points must be between 1 and 1000'
    }

    if (limitClaims && formData.max_participants < 1) {
      newErrors.max_participants = 'Set how many students can take it on, or turn off the limit'
    }

    if (formData.deadline) {
      const d = new Date(`${formData.deadline}T23:59:59`)
      if (isNaN(d.getTime()) || d <= new Date()) newErrors.deadline = 'Deadline must be in the future'
    }

    return newErrors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = validate()
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      toast.error('Fix the highlighted fields to post')
      return
    }

    const validRewards = rewards
      .map(r => {
        if (r.type === 'xp') return { type: 'xp', value: r.value, pillar: r.pillar }
        if (r.type === 'points') return { type: 'points', value: r.value }
        return { type: 'custom', text: r.text.trim() }
      })

    const payload = {
      title: formData.title,
      description: formData.description,
      max_participants: limitClaims ? formData.max_participants : 0,
      repeatable: formData.repeatable,
      requires_evidence: formData.requires_evidence,
      visibility: formData.visibility,
      // Keep existing deliverable ids on edit so in-flight claims survive.
      deliverables: deliverables.filter(d => d.text.trim())
        .map(d => d.id ? { id: d.id, text: d.text.trim() } : { text: d.text.trim() }),
      rewards: validRewards,
      // Send selected kids for family visibility; empty/null = all kids
      allowed_student_ids: formData.visibility === 'family' && selectedKids.length > 0 ? selectedKids : null,
      // Optional cohort restriction (only students in this class see the
      // bounty). Offered only for a school bounty, so it is cleared otherwise.
      cohort_class_id: formData.visibility === 'organization' ? (formData.cohort_class_id || null) : null,
    }
    if (formData.deadline) {
      payload.deadline = new Date(`${formData.deadline}T23:59:59`).toISOString()
    }
    // No deadline picked on create: the backend defaults to one year out.

    if (isEdit) {
      updateMutation.mutate({ id: bountyId, ...payload })
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => navigate(backTo),
      })
    }
  }

  // An AI idea lands in the same fields the poster would have typed into;
  // posting stays their separate click.
  const applyAiIdea = (idea) => {
    setFormData(prev => ({ ...prev, title: idea.title, description: idea.description }))
    setDeliverables(idea.deliverables.length
      ? idea.deliverables.map(text => ({ id: null, text }))
      : [{ id: null, text: '' }])
    setRewards(idea.rewards)
    if (idea.childId) {
      setFormData(prev => ({ ...prev, visibility: 'family' }))
      setSelectedKids([idea.childId])
    }
    setErrors({})
  }


  const formHasContent = !!(formData.title.trim() || formData.description.trim()
    || deliverables.some(d => d.text.trim()) || rewards.length > 0)

  const isPending = createMutation.isPending || updateMutation.isPending
  const hasOrg = !!user?.organization_id

  // Offer only the audiences this person can actually post to: "My school"
  // needs a school, "Students linked to me" needs linked students (or is a
  // parent's own default). The one already chosen always stays visible.
  const visibilityOptions = VISIBILITY_OPTIONS.filter(v => {
    if (v.key === formData.visibility) return true
    if (v.key === 'organization') return hasOrg
    if (v.key === 'family') return dependents.length > 0 || posterRole === 'parent' || posterRole === 'observer'
    return true
  })

  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
  const isOptio = user?.role === 'superadmin' || OPTIO_USERS.includes(fullName.toLowerCase())
  const sponsorName = isOptio ? 'Optio' : (user?.display_name || fullName || 'You')

  const chooseVisibility = (key) => {
    handleChange('visibility', key)
    if (key !== 'family') setSelectedKids([])
    if (key !== 'organization') handleChange('cohort_class_id', '')
  }

  const toggleKid = (kid) => {
    const allSelected = selectedKids.length === 0
    const isSelected = allSelected || selectedKids.includes(kid.id)
    setSelectedKids(prev => {
      // Switching from "all" to a list: everyone except this one.
      if (allSelected) return dependents.map(d => d.id).filter(id => id !== kid.id)
      if (isSelected) return prev.filter(id => id !== kid.id)
      const next = [...prev, kid.id]
      return next.length === dependents.length ? [] : next
    })
  }

  if (isEdit && loadingBounty) {
    return (
      <PageLoader className="min-h-[60vh]" />
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button
        type="button"
        onClick={() => navigate(backTo)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-optio-purple mb-4 min-h-[40px]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit bounty' : 'Post a bounty'}</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-xl">
          A bounty is a task students can choose to take on. They check off each step, turn it in,
          and you approve it to give them the reward.
        </p>
        {!isEdit && (
          <div className="mt-3">
            <BountyAiDraftPanel onDrafted={applyAiIdea} hasDraft={formHasContent} kids={dependents} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Section step={1} title="What is it?" hint="A short name, and what students should do.">
          <div>
            <label htmlFor="bounty-title" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="bounty-title"
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder='e.g. "Clean the supply room"'
              aria-describedby={errors.title ? 'bounty-title-error' : undefined}
              className={fieldCls(errors.title)}
            />
            {errors.title && <p id="bounty-title-error" role="alert" className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>
          <div>
            <label htmlFor="bounty-description" className="block text-sm font-medium text-gray-700 mb-1">Instructions</label>
            <textarea
              id="bounty-description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="What should students do, and why does it matter?"
              rows={3}
              aria-describedby={errors.description ? 'bounty-description-error' : undefined}
              className={`${fieldCls(errors.description)} resize-y`}
            />
            {errors.description && <p id="bounty-description-error" role="alert" className="mt-1 text-sm text-red-600">{errors.description}</p>}
          </div>
        </Section>

        <Section
          step={2}
          title="Steps to finish"
          hint={formData.requires_evidence
            ? 'Students add a photo or note as proof to finish each step. Make each one easy to check.'
            : 'Students tick each step off themselves when it is done.'}
        >
          <ol className="space-y-2">
            {deliverables.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <span aria-hidden className="w-6 text-right text-sm text-gray-400">{i + 1}.</span>
                <input
                  type="text"
                  value={d.text}
                  onChange={(e) => updateDeliverable(i, e.target.value)}
                  placeholder={i === 0 ? 'e.g. "Put every book back on the shelf"' : 'Another step'}
                  aria-label={`Step ${i + 1}`}
                  className={`${fieldCls(errors.deliverables && i === 0)} flex-1`}
                />
                {deliverables.length > 1 && (
                  <RemoveButton onClick={() => removeDeliverable(i)} label={`Remove step ${i + 1}`} />
                )}
              </li>
            ))}
          </ol>
          <button type="button" onClick={addDeliverable} className="btn-ghost">
            <PlusIcon /> Add a step
          </button>
          {errors.deliverables && <p role="alert" className="text-sm text-red-600">{errors.deliverables}</p>}
          <div className="border-t border-gray-100 pt-4">
            <Toggle
              id="bounty-requires-evidence"
              label="Ask for proof on each step"
              hint={formData.requires_evidence
                ? 'Students upload a photo, file or note before a step counts as done.'
                : 'Off: students just tick the step. Good for daily chores that do not need a picture every day.'}
              checked={formData.requires_evidence}
              onChange={(v) => handleChange('requires_evidence', v)}
            />
          </div>
        </Section>

        <Section
          step={3}
          title="Reward"
          hint="XP counts toward school credit. A prize, like a library book or extra free time, does not, so use a prize for chores."
        >
          {rewards.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
              No reward yet. You can post without one.
            </p>
          )}
          {rewards.map((r, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              {r.type === 'xp' ? (
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-optio-purple bg-optio-purple/10 px-2 py-0.5 rounded">XP</span>
                    <input
                      type="number"
                      value={r.value}
                      onChange={(e) => updateReward(i, 'value', parseInt(e.target.value) || 0)}
                      min={25}
                      max={200}
                      aria-label="XP amount"
                      className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple/20"
                    />
                    <span className="text-sm text-gray-500">XP, from 25 to 200</span>
                  </div>
                  {/* Pillar buttons hidden for schools that switched the
                      pillars off; the reward keeps its 'stem' default, which
                      those orgs never see anywhere. Every reward row gets a
                      default on creation, so hiding the control can never
                      leave the pillar unset behind the validation. */}
                  {!hidePillars && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-gray-500 mr-1">Area:</span>
                      {PILLARS.map(p => (
                        <button
                          key={p.key}
                          type="button"
                          aria-pressed={r.pillar === p.key}
                          onClick={() => updateReward(i, 'pillar', p.key)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            r.pillar === p.key ? 'bg-optio-purple text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-optio-purple'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : r.type === 'points' ? (
                <div className="flex-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">Points</span>
                  <input
                    type="number"
                    value={r.value}
                    onChange={(e) => updateReward(i, 'value', parseInt(e.target.value) || 0)}
                    min={1}
                    max={1000}
                    aria-label="Points amount"
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple/20"
                  />
                  <span className="text-sm text-gray-500">school points, added when you approve it</span>
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Prize</span>
                  <input
                    type="text"
                    value={r.text}
                    onChange={(e) => updateReward(i, 'text', e.target.value)}
                    placeholder='e.g. "Rent one library book"'
                    aria-label="Prize"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple/20"
                  />
                </div>
              )}
              <RemoveButton onClick={() => removeReward(i)} label={r.type === 'xp' ? 'Remove XP reward' : r.type === 'points' ? 'Remove points' : 'Remove prize'} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addReward('xp')} className="btn-quiet">
              <PlusIcon /> Add XP
            </button>
            <button type="button" onClick={() => addReward('custom')} className="btn-quiet">
              <PlusIcon /> Add a prize
            </button>
            {offerPoints && (
              <button type="button" onClick={() => addReward('points')} className="btn-quiet">
                <PlusIcon /> Add points
              </button>
            )}
          </div>
          {errors.rewards && <p role="alert" className="text-sm text-red-600">{errors.rewards}</p>}
        </Section>

        <Section step={4} title="Who can take it on?">
          <div className="space-y-2" role="radiogroup" aria-label="Who can take it on?">
            {visibilityOptions.map(v => (
              <div key={v.key}>
                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                    formData.visibility === v.key ? 'border-optio-purple bg-optio-purple/5' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={v.key}
                    checked={formData.visibility === v.key}
                    onChange={() => chooseVisibility(v.key)}
                    className="mt-1 text-optio-purple focus:ring-optio-purple"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{v.label}</span>
                    <span className="block text-sm text-gray-500">{v.desc}</span>
                  </span>
                </label>

                {v.key === 'organization' && formData.visibility === 'organization' && cohorts.length > 0 && (
                  <div className="ml-8 mt-2">
                    <label htmlFor="bounty-cohort" className="block text-sm font-medium text-gray-700 mb-1">Only one class (optional)</label>
                    <select
                      id="bounty-cohort"
                      value={formData.cohort_class_id}
                      onChange={(e) => handleChange('cohort_class_id', e.target.value)}
                      className="input-field"
                    >
                      <option value="">Every student at the school</option>
                      {cohorts.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {v.key === 'family' && formData.visibility === 'family' && dependents.length > 0 && (
                  <div className="ml-8 mt-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                    <p className="text-xs font-medium text-gray-600 mb-1">Which students?</p>
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selectedKids.length === 0}
                        onChange={() => setSelectedKids([])}
                        className="rounded text-optio-purple focus:ring-optio-purple"
                      />
                      All of them
                    </label>
                    {dependents.map(kid => (
                      <label key={kid.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={selectedKids.length === 0 || selectedKids.includes(kid.id)}
                          onChange={() => toggleKid(kid)}
                          className="rounded text-optio-purple focus:ring-optio-purple"
                        />
                        {kid.display_name || kid.first_name || 'Unnamed'}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Options" hint="All optional. Leave them off for a one-time task with no limit.">
          <Toggle
            id="bounty-repeatable"
            label="Repeatable"
            hint="A student can do it again after each approval, like a daily chore."
            checked={formData.repeatable}
            onChange={(v) => handleChange('repeatable', v)}
          />
          <Toggle
            id="bounty-limit"
            label="Limit how many students can take it on"
            hint="Off means any number of students."
            checked={limitClaims}
            onChange={(v) => {
              setLimitClaims(v)
              if (v && formData.max_participants < 1) handleChange('max_participants', 1)
            }}
          >
            <div className="flex items-center gap-2">
              <label htmlFor="bounty-max-claims" className="text-sm text-gray-700">Up to</label>
              <input
                id="bounty-max-claims"
                type="number"
                min={1}
                value={formData.max_participants}
                onChange={(e) => handleChange('max_participants', Math.max(0, parseInt(e.target.value) || 0))}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple/20"
              />
              <span className="text-sm text-gray-700">students</span>
            </div>
            {errors.max_participants && <p role="alert" className="mt-1 text-sm text-red-600">{errors.max_participants}</p>}
          </Toggle>
          <div>
            <label htmlFor="bounty-deadline" className="block text-sm font-medium text-gray-900">Last day to start</label>
            <p className="text-sm text-gray-500 mb-2">Leave it blank to keep the bounty open for a year.</p>
            <input
              id="bounty-deadline"
              type="date"
              value={formData.deadline}
              onChange={(e) => handleChange('deadline', e.target.value)}
              aria-describedby={errors.deadline ? 'bounty-deadline-error' : undefined}
              className={`${fieldCls(errors.deadline)} sm:max-w-xs`}
            />
            {errors.deadline && <p id="bounty-deadline-error" role="alert" className="mt-1 text-sm text-red-600">{errors.deadline}</p>}
          </div>
        </Section>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {isOptio ? (
              <img src={OPTIO_LOGO} alt="" className="w-5 h-5 rounded-sm" />
            ) : (
              <span aria-hidden className="w-5 h-5 rounded-sm bg-optio-purple/10 flex items-center justify-center text-xs font-bold text-optio-purple">
                {sponsorName.charAt(0).toUpperCase()}
              </span>
            )}
            <span>Students see it as posted by <span className="font-medium text-gray-900">{sponsorName}</span></span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate(backTo)} className="btn-quiet min-h-[44px]">Cancel</button>
            <button type="submit" disabled={isPending} className="btn-primary min-h-[44px]">
              {isPending ? 'Saving...' : isEdit ? 'Save changes' : 'Post bounty'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default BountyCreatePage
