import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeftIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import {
  getFunnel,
  createFunnel,
  updateFunnel,
  createStep,
  updateStep,
  deleteStep,
  reorderSteps,
} from './crmApi'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { Alert, FormFooter, PageLoader } from '../../../components/ui'
import { CONTACT_TYPES, CONTACT_TYPE_LABELS, FUNNEL_TYPES } from './crmConstants'

const EMPTY_FORM = {
  name: '',
  description: '',
  status: 'paused',
  funnel_type: 'nurture',
  entry_types: [],
}

/** Best-effort read of the conflicting funnel's name from a 409 payload. */
const conflictFunnelName = (data = {}) =>
  data.conflict_funnel_name ||
  data.conflict?.funnel_name ||
  data.conflict?.name ||
  data.funnel_name ||
  'another funnel'

/**
 * Funnel editor - one form, one save. Funnel basics plus edited step fields
 * save together; structural step changes (add / remove / reorder) hit the API
 * immediately. Entry-type conflicts (409) offer a confirmed steal retry.
 */
const FunnelEditor = () => {
  const { funnelId } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const isNew = !funnelId

  const [form, setForm] = useState(EMPTY_FORM)
  const [steps, setSteps] = useState([])
  const [stepUnits, setStepUnits] = useState({})
  const [dirtyStepIds, setDirtyStepIds] = useState(new Set())
  const [activeLeads, setActiveLeads] = useState(0)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_FORM)
      setSteps([])
      setLoading(false)
      return
    }
    load()
  }, [funnelId]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    try {
      const response = await getFunnel(funnelId)
      const data = response.data || {}
      const funnel = data.funnel || data
      setForm({
        name: funnel.name || '',
        description: funnel.description || '',
        status: funnel.status || 'paused',
        funnel_type: funnel.funnel_type || 'nurture',
        entry_types: funnel.entry_types || [],
      })
      const loadedSteps = [...(data.steps || funnel.steps || [])].sort(
        (a, b) => (a.step_order ?? 0) - (b.step_order ?? 0)
      )
      setSteps(loadedSteps)
      setStepUnits(
        Object.fromEntries(
          loadedSteps.map((step) => [
            step.id,
            step.delay_hours >= 24 && step.delay_hours % 24 === 0 ? 'days' : 'hours',
          ])
        )
      )
      setDirtyStepIds(new Set())
      setActiveLeads(funnel.active_leads ?? funnel.active_members ?? 0)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load funnel')
    } finally {
      setLoading(false)
    }
  }

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const toggleEntryType = (type) => {
    setForm((prev) => ({
      ...prev,
      entry_types: prev.entry_types.includes(type)
        ? prev.entry_types.filter((t) => t !== type)
        : [...prev.entry_types, type],
    }))
  }

  const patchStep = (stepId, patch) => {
    setSteps((prev) => prev.map((step) => (step.id === stepId ? { ...step, ...patch } : step)))
    setDirtyStepIds((prev) => new Set(prev).add(stepId))
  }

  const displayDelay = (step) =>
    stepUnits[step.id] === 'days'
      ? Math.round((step.delay_hours / 24) * 100) / 100
      : step.delay_hours

  const handleDelayChange = (step, rawValue) => {
    const n = Number(rawValue)
    if (Number.isNaN(n) || n < 0) return
    patchStep(step.id, {
      delay_hours: stepUnits[step.id] === 'days' ? Math.round(n * 24) : Math.round(n),
    })
  }

  const saveDirtySteps = async () => {
    for (const step of steps) {
      if (!dirtyStepIds.has(step.id)) continue
      await updateStep(step.id, {
        name: step.name,
        delay_hours: step.delay_hours,
        is_active: step.is_active,
      })
    }
  }

  const funnelPayload = () => ({
    name: form.name,
    description: form.description,
    status: form.status,
    funnel_type: form.funnel_type,
    entry_types: form.entry_types,
  })

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('The funnel needs a name')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const response = await createFunnel(funnelPayload())
        const newId = response.data?.funnel?.id || response.data?.id
        toast.success('Funnel created')
        if (newId) {
          navigate(`/admin/crm/funnels/${newId}`, { replace: true })
        } else {
          navigate('/admin/crm/funnels')
        }
        return
      }

      try {
        await updateFunnel(funnelId, funnelPayload())
      } catch (error) {
        if (error.response?.status === 409) {
          const name = conflictFunnelName(error.response.data)
          toast.error(
            error.response.data?.error ||
              `An entry type already feeds "${name}" - each type can feed only one funnel`
          )
          const steal = await confirm({
            title: `Steal entry types from "${name}"?`,
            body: 'The conflicting entry types stop feeding that funnel and feed this one instead.',
            confirmLabel: 'Steal entry types',
            destructive: false,
          })
          if (!steal) return
          await updateFunnel(funnelId, { ...funnelPayload(), steal: true })
        } else {
          throw error
        }
      }

      await saveDirtySteps()
      toast.success('Funnel saved')
      load()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save funnel')
    } finally {
      setSaving(false)
    }
  }

  const handleAddStep = async () => {
    try {
      const lastDelay = steps.length ? steps[steps.length - 1].delay_hours || 0 : 0
      const response = await createStep(funnelId, {
        name: `Step ${steps.length + 1}`,
        subject: '',
        html_body: '<p>Draft email content</p>',
        delay_hours: lastDelay + 48,
        is_active: false,
      })
      const stepId = response.data?.step?.id || response.data?.id
      toast.success('Step added')
      if (stepId) {
        navigate(`/admin/crm/funnels/${funnelId}/steps/${stepId}`)
      } else {
        load()
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add step')
    }
  }

  const handleRemoveStep = async (step) => {
    const ok = await confirm({
      title: `Remove step "${step.name}"?`,
      body: 'This deletes the step and its email content. Leads past it advance to the next remaining step.',
      confirmLabel: 'Remove step',
    })
    if (!ok) return
    try {
      await deleteStep(step.id)
      toast.success('Step removed')
      load()
    } catch (error) {
      if (error.response?.status === 409) {
        const deactivate = await confirm({
          title: 'This step has send history',
          body: 'Steps that have already been sent cannot be deleted. Deactivate it instead so it stops sending?',
          confirmLabel: 'Deactivate step',
          destructive: false,
        })
        if (!deactivate) return
        try {
          await updateStep(step.id, { is_active: false })
          toast.success('Step deactivated')
          load()
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to deactivate step')
        }
      } else {
        toast.error(error.response?.data?.error || 'Failed to remove step')
      }
    }
  }

  const handleMoveStep = async (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    const renumbered = next.map((step, i) => ({ ...step, step_order: i + 1 }))
    setSteps(renumbered)
    try {
      await reorderSteps(funnelId, renumbered.map((step) => step.id))
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reorder steps')
      load()
    }
  }

  if (loading) {
    return <PageLoader label="Loading funnel" />
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

  return (
    <div className="max-w-4xl">
      <Link
        to="/admin/crm/funnels"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-optio-purple transition-colors mb-3"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to funnels
      </Link>
      <h2 className="text-2xl font-bold mb-6">{isNew ? 'New funnel' : 'Edit funnel'}</h2>

      {!isNew && activeLeads > 0 && (
        <Alert variant="warning" title={`${activeLeads} lead${activeLeads === 1 ? '' : 's'} mid-funnel`} className="mb-6">
          Changes apply to leads already in this funnel. Removing a step advances them to the
          next remaining step.
        </Alert>
      )}

      {/* Funnel basics */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-6 space-y-4">
        <div>
          <label htmlFor="funnel-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            id="funnel-name"
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="funnel-description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="funnel-description"
            rows={2}
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            className={`${inputClass} resize-vertical`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Status</span>
            <div className="flex bg-gray-100 rounded-lg p-1 w-fit" role="group" aria-label="Funnel status">
              {['active', 'paused'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setField('status', status)}
                  aria-pressed={form.status === status}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    form.status === status
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {status === 'active' ? 'Active' : 'Paused'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="funnel-type" className="block text-sm font-medium text-gray-700 mb-1">
              Funnel type
            </label>
            <select
              id="funnel-type"
              value={form.funnel_type}
              onChange={(e) => setField('funnel_type', e.target.value)}
              className={inputClass}
            >
              {FUNNEL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === 'nurture' ? 'Nurture (exits on conversion)' : 'Onboarding (keeps sending)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-2">Entry types</span>
          <p className="text-xs text-gray-500 mb-2">
            Form submissions of these types enter this funnel. Each type can feed at most one
            funnel.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CONTACT_TYPES.map((type) => (
              <label
                key={type}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-sm transition-colors ${
                  form.entry_types.includes(type)
                    ? 'border-optio-purple/40 bg-optio-purple/5 text-optio-purple'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.entry_types.includes(type)}
                  onChange={() => toggleEntryType(type)}
                  className="rounded"
                />
                {CONTACT_TYPE_LABELS[type] || type}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Steps</h3>
          {!isNew && (
            <button
              onClick={handleAddStep}
              className="px-3 py-1.5 text-sm font-medium text-optio-purple bg-optio-purple/5 border border-optio-purple/20 rounded-lg hover:bg-optio-purple/10 transition-colors"
            >
              Add step
            </button>
          )}
        </div>

        {isNew ? (
          <Alert variant="info">Save the funnel first, then add steps.</Alert>
        ) : steps.length === 0 ? (
          <p className="text-sm text-gray-400">No steps yet. Add the first email.</p>
        ) : (
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className="border border-gray-200 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex sm:flex-col gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleMoveStep(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move step ${step.step_order} up`}
                    className="p-1 rounded text-gray-400 hover:text-optio-purple hover:bg-optio-purple/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronUpIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMoveStep(index, 1)}
                    disabled={index === steps.length - 1}
                    aria-label={`Move step ${step.step_order} down`}
                    className="p-1 rounded text-gray-400 hover:text-optio-purple hover:bg-optio-purple/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronDownIcon className="w-4 h-4" />
                  </button>
                </div>

                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-bold flex items-center justify-center">
                  {step.step_order}
                </span>

                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={step.name || ''}
                    onChange={(e) => patchStep(step.id, { name: e.target.value })}
                    aria-label={`Step ${step.step_order} name`}
                    className="w-full px-2 py-1 border border-transparent hover:border-gray-200 focus:border-gray-300 rounded text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-optio-purple"
                  />
                  <div className="mt-1 flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                    <input
                      type="number"
                      min="0"
                      value={displayDelay(step)}
                      onChange={(e) => handleDelayChange(step, e.target.value)}
                      aria-label={`Step ${step.step_order} delay`}
                      className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                    />
                    <select
                      value={stepUnits[step.id] || 'hours'}
                      onChange={(e) =>
                        setStepUnits((prev) => ({ ...prev, [step.id]: e.target.value }))
                      }
                      aria-label={`Step ${step.step_order} delay unit`}
                      className="px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                    >
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                    <span className="text-xs text-gray-400">after funnel entry</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={step.is_active !== false}
                      onChange={(e) => patchStep(step.id, { is_active: e.target.checked })}
                      className="rounded"
                    />
                    Active
                  </label>
                  <Link
                    to={`/admin/crm/funnels/${funnelId}/steps/${step.id}`}
                    className="text-sm font-medium text-optio-purple hover:underline"
                  >
                    Edit content
                  </Link>
                  <button
                    onClick={() => handleRemoveStep(step)}
                    aria-label={`Remove step ${step.step_order}`}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FormFooter
        onCancel={() => navigate('/admin/crm/funnels')}
        onSubmit={handleSave}
        submitText={isNew ? 'Create funnel' : 'Save changes'}
        isSubmitting={saving}
      />
    </div>
  )
}

export default FunnelEditor
