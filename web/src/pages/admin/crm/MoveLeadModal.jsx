import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { listFunnels, getFunnel, moveLead } from './crmApi'
import { Modal, FormFooter } from '../../../components/ui'

/**
 * Move a lead into a funnel at a specific step: pick funnel, then step, then
 * POST /leads/<id>/move {funnel_id, step_order}.
 */
const MoveLeadModal = ({ isOpen, onClose, lead, onMoved }) => {
  const [funnels, setFunnels] = useState([])
  const [funnelId, setFunnelId] = useState('')
  const [steps, setSteps] = useState([])
  const [stepOrder, setStepOrder] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setFunnelId('')
    setStepOrder('')
    setSteps([])
    const load = async () => {
      try {
        const response = await listFunnels()
        setFunnels(response.data?.funnels || response.data || [])
      } catch (error) {
        toast.error('Failed to load funnels')
      }
    }
    load()
  }, [isOpen])

  useEffect(() => {
    if (!funnelId) {
      setSteps([])
      setStepOrder('')
      return
    }
    const load = async () => {
      try {
        const response = await getFunnel(funnelId)
        const data = response.data || {}
        const loaded = data.steps || data.funnel?.steps || []
        setSteps([...loaded].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0)))
        setStepOrder('')
      } catch (error) {
        toast.error('Failed to load funnel steps')
        setSteps([])
      }
    }
    load()
  }, [funnelId])

  const handleMove = async () => {
    if (!funnelId || !stepOrder) return
    setSaving(true)
    try {
      await moveLead(lead.id, { funnel_id: funnelId, step_order: Number(stepOrder) })
      toast.success('Lead moved')
      onMoved?.()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to move lead')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Move lead" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Move <span className="font-medium">{lead?.email}</span> to a funnel step. The step
          you pick is treated as already sent; the next step sends when it is due.
        </p>
        <div>
          <label htmlFor="move-funnel" className="block text-sm font-medium text-gray-700 mb-1">
            Funnel
          </label>
          <select
            id="move-funnel"
            value={funnelId}
            onChange={(e) => setFunnelId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-sm"
          >
            <option value="">Select a funnel...</option>
            {funnels.map((funnel) => (
              <option key={funnel.id} value={funnel.id}>
                {funnel.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="move-step" className="block text-sm font-medium text-gray-700 mb-1">
            Step
          </label>
          <select
            id="move-step"
            value={stepOrder}
            onChange={(e) => setStepOrder(e.target.value)}
            disabled={!funnelId}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select a step...</option>
            {steps.map((step) => (
              <option key={step.id} value={step.step_order}>
                {step.step_order}. {step.name}
              </option>
            ))}
          </select>
        </div>
        <FormFooter
          onCancel={onClose}
          onSubmit={handleMove}
          submitText="Move lead"
          isSubmitting={saving}
          disabled={!funnelId || !stepOrder}
        />
      </div>
    </Modal>
  )
}

export default MoveLeadModal
