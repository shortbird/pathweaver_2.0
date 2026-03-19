import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCreateBounty, useBountyDetail } from '../hooks/api/useBounties'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../utils/queryKeys'
import api from '../services/api'
import toast from 'react-hot-toast'

const PILLARS = [
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Communication' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
]

const VISIBILITY_OPTIONS = [
  { key: 'public', label: 'All Optio Users', desc: 'Anyone on the platform can see and claim this bounty' },
  { key: 'family', label: 'Linked Students', desc: 'Only students linked to your account can see this bounty' },
  { key: 'organization', label: 'My Organization', desc: 'Only members of your organization can see this bounty' },
]

const OPTIO_LOGO = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'
const OPTIO_USERS = ['tanner bowman']

const BountyCreatePage = () => {
  const navigate = useNavigate()
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
      navigate('/bounties')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update bounty')
    },
  })

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    max_participants: 0,
    visibility: 'public',
  })
  const [deliverables, setDeliverables] = useState([''])
  const [rewards, setRewards] = useState([])
  const [errors, setErrors] = useState({})
  const [dependents, setDependents] = useState([])
  const [selectedKids, setSelectedKids] = useState([]) // empty = all kids

  // Fetch dependents + linked students for family visibility
  useEffect(() => {
    const fetchChildren = async () => {
      const allKids = []
      const seenIds = new Set()

      // Fetch managed dependents (under 13)
      try {
        const res = await api.get('/api/dependents/my-dependents')
        for (const kid of (res.data.dependents || [])) {
          if (!seenIds.has(kid.id)) {
            allKids.push(kid)
            seenIds.add(kid.id)
          }
        }
      } catch {
        // Not a parent or no dependents
      }

      // Fetch linked students (13+ and advisor-linked) from observer links
      try {
        const res = await api.get('/api/observers/my-students')
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

  // Populate form when editing
  useEffect(() => {
    if (!existingBounty) return
    setFormData({
      title: existingBounty.title || '',
      description: existingBounty.description || '',
      max_participants: existingBounty.max_participants || 0,
      visibility: existingBounty.visibility || 'public',
    })
    const dels = (existingBounty.deliverables || []).map(d => d.text || d)
    setDeliverables(dels.length > 0 ? dels : [''])

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
  const addDeliverable = () => setDeliverables(prev => [...prev, ''])
  const updateDeliverable = (i, val) => {
    setDeliverables(prev => prev.map((d, idx) => idx === i ? val : d))
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
    if (!formData.title.trim()) newErrors.title = 'Title is required'
    if (!formData.description.trim()) newErrors.description = 'Description is required'
    const nonEmptyDels = deliverables.filter(d => d.trim())
    if (nonEmptyDels.length === 0) newErrors.deliverables = 'At least one deliverable is required'

    // Check total XP doesn't exceed 200
    const totalXp = rewards.filter(r => r.type === 'xp').reduce((sum, r) => sum + (r.value || 0), 0)
    if (totalXp > 200) newErrors.rewards = 'Total XP cannot exceed 200'

    return newErrors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = validate()
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const validRewards = rewards
      .filter(r => (r.type === 'xp' && r.value >= 25 && r.pillar) || (r.type === 'custom' && r.text.trim()))
      .map(r => r.type === 'xp' ? { type: 'xp', value: r.value, pillar: r.pillar } : { type: 'custom', text: r.text.trim() })

    const payload = {
      title: formData.title,
      description: formData.description,
      max_participants: formData.max_participants,
      visibility: formData.visibility,
      deliverables: deliverables.filter(d => d.trim()),
      rewards: validRewards,
      // Send selected kids for family visibility; empty/null = all kids
      allowed_student_ids: formData.visibility === 'family' && selectedKids.length > 0 ? selectedKids : null,
    }

    if (isEdit) {
      updateMutation.mutate({ id: bountyId, ...payload })
    } else {
      payload.deadline = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      createMutation.mutate(payload, {
        onSuccess: () => navigate('/bounties'),
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const hasOrg = !!user?.organization_id

  if (isEdit && loadingBounty) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => navigate('/bounties')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 min-h-[44px]"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Bounty Board
      </button>

      <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {isEdit ? 'Edit Bounty' : 'Post a Bounty'}
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        Create clear, objective deliverables so students know exactly what to do.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="What's the challenge?"
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="What is this bounty about? Give students context."
            rows={3}
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple resize-none ${errors.description ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
        </div>

        {/* Deliverables */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Deliverables</label>
          <p className="text-xs text-gray-400 mb-3">
            Be as specific and objective as possible. Students will check these off as they complete them.
          </p>
          <div className="space-y-2">
            {deliverables.map((d, i) => (
              <div key={i} className="flex gap-2">
                <div className="flex items-center justify-center w-6 h-6 mt-3 rounded border-2 border-gray-300 flex-shrink-0">
                  <span className="text-xs text-gray-400">{i + 1}</span>
                </div>
                <input
                  type="text"
                  value={d}
                  onChange={(e) => updateDeliverable(i, e.target.value)}
                  placeholder={`Deliverable ${i + 1}...`}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
                />
                {deliverables.length > 1 && (
                  <button type="button" onClick={() => removeDeliverable(i)} className="p-2 text-gray-400 hover:text-red-500 min-h-[44px]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addDeliverable} className="mt-2 flex items-center gap-1 text-sm text-optio-purple font-medium hover:text-optio-purple-dark min-h-[36px]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add deliverable
          </button>
          {errors.deliverables && <p className="text-red-500 text-sm mt-1">{errors.deliverables}</p>}
        </div>

        {/* Rewards */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rewards</label>
          <p className="text-xs text-gray-400 mb-3">
            What students earn for completing this bounty. Add XP and/or custom rewards.
          </p>
          <div className="space-y-3">
            {rewards.map((r, i) => (
              <div key={i} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
                {r.type === 'xp' ? (
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-optio-purple bg-optio-purple/10 px-2 py-0.5 rounded">XP</span>
                      <input
                        type="number"
                        value={r.value}
                        onChange={(e) => updateReward(i, 'value', parseInt(e.target.value) || 0)}
                        min={25}
                        max={200}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-sm"
                      />
                      <span className="text-xs text-gray-400">XP (25-200)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PILLARS.map(p => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => updateReward(i, 'pillar', p.key)}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                            r.pillar === p.key ? 'bg-optio-purple text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Custom</span>
                    </div>
                    <input
                      type="text"
                      value={r.text}
                      onChange={(e) => updateReward(i, 'text', e.target.value)}
                      placeholder='e.g. "Pizza night", "$10 gift card"'
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-sm"
                    />
                  </div>
                )}
                <button type="button" onClick={() => removeReward(i)} className="p-1 text-gray-400 hover:text-red-500 mt-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => addReward('xp')} className="flex items-center gap-1 text-sm text-optio-purple font-medium hover:text-optio-purple-dark min-h-[36px]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add XP reward
            </button>
            <button type="button" onClick={() => addReward('custom')} className="flex items-center gap-1 text-sm text-amber-600 font-medium hover:text-amber-700 min-h-[36px]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add custom reward
            </button>
          </div>
          {errors.rewards && <p className="text-red-500 text-sm mt-1">{errors.rewards}</p>}
        </div>

        {/* Visibility */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Who can see this bounty?</label>
          <div className="space-y-2">
            {VISIBILITY_OPTIONS
              .filter(v => v.key !== 'organization' || hasOrg)
              .map(v => (
                <div key={v.key}>
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      formData.visibility === v.key
                        ? 'border-optio-purple bg-optio-purple/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={v.key}
                      checked={formData.visibility === v.key}
                      onChange={() => {
                        handleChange('visibility', v.key)
                        if (v.key !== 'family') setSelectedKids([])
                      }}
                      className="mt-0.5 text-optio-purple focus:ring-optio-purple"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">{v.label}</span>
                      <p className="text-xs text-gray-500 mt-0.5">{v.desc}</p>
                    </div>
                  </label>

                  {/* Inline kid selector when "My Kids Only" is selected and user has >1 kid */}
                  {v.key === 'family' && formData.visibility === 'family' && dependents.length > 0 && (
                    <div className="ml-8 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-xs font-medium text-gray-600 mb-2">Which users can see this bounty?</p>
                      <label
                        className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all mb-1 ${
                          selectedKids.length === 0 ? 'bg-optio-purple/10 text-optio-purple' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                        onClick={() => setSelectedKids([])}
                      >
                        <input
                          type="checkbox"
                          checked={selectedKids.length === 0}
                          onChange={() => setSelectedKids([])}
                          className="rounded text-optio-purple focus:ring-optio-purple"
                        />
                        <span className="text-sm font-medium">All linked students</span>
                      </label>
                      {dependents.map(kid => {
                        const allSelected = selectedKids.length === 0
                        const isSelected = allSelected || selectedKids.includes(kid.id)
                        return (
                          <label
                            key={kid.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all ${
                              isSelected ? 'bg-optio-purple/10 text-optio-purple' : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedKids(prev => {
                                  if (allSelected) {
                                    // Switching from "all" to explicit: select everyone except this one
                                    return dependents.map(d => d.id).filter(id => id !== kid.id)
                                  }
                                  if (isSelected) {
                                    return prev.filter(id => id !== kid.id)
                                  }
                                  const next = [...prev, kid.id]
                                  // If all are now selected, switch back to "all" mode
                                  if (next.length === dependents.length) return []
                                  return next
                                })
                              }}
                              className="rounded text-optio-purple focus:ring-optio-purple"
                            />
                            <span className="text-sm">{kid.display_name || kid.first_name || 'Unnamed'}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* Max Students */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Claims</label>
          <input
            type="number"
            value={formData.max_participants}
            onChange={(e) => handleChange('max_participants', parseInt(e.target.value) || 0)}
            min={0}
            placeholder="0 = no limit"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
          />
          <p className="text-xs text-gray-400 mt-1">{formData.max_participants === 0 ? 'No limit' : `${formData.max_participants} max`}</p>
        </div>

        {/* Sponsor preview */}
        {(() => {
          const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
          const isOptio = user?.role === 'superadmin' || OPTIO_USERS.includes(fullName.toLowerCase())
          const sponsorName = isOptio ? 'Optio' : (user?.display_name || fullName || 'You')
          return (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              {isOptio ? (
                <img src={OPTIO_LOGO} alt="Optio" className="w-6 h-6 rounded-sm" />
              ) : (
                <div className="w-6 h-6 rounded-sm bg-optio-purple/20 flex items-center justify-center text-xs font-bold text-optio-purple">
                  {sponsorName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <span className="text-sm text-gray-500">Posted by </span>
                <span className="text-sm font-medium text-gray-900">{sponsorName}</span>
              </div>
            </div>
          )
        })()}

        <button
          type="submit"
          disabled={isPending}
          className="w-full px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-bold hover:shadow-lg transition-all min-h-[44px] disabled:opacity-50"
        >
          {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Post Bounty'}
        </button>
      </form>
    </div>
  )
}

export default BountyCreatePage
