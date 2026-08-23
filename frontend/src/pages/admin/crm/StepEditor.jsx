import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { getFunnel, updateStep, testSendStep } from './crmApi'
import { FormFooter, PageLoader } from '../../../components/ui'
import EmptyState from '../../../components/ui/EmptyState'
import HtmlEmailEditor from './HtmlEmailEditor'

/**
 * Step / email editor. The step's content arrives with GET /funnels/<id>
 * (steps carry their subject and html_body - there is no GET /steps/<id>).
 * "Send test to me" posts the CURRENT unsaved draft.
 */
const StepEditor = () => {
  const { funnelId, stepId } = useParams()
  const navigate = useNavigate()

  const [funnelName, setFunnelName] = useState('')
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await getFunnel(funnelId)
        const data = response.data || {}
        const funnel = data.funnel || data
        setFunnelName(funnel.name || '')
        const steps = data.steps || funnel.steps || []
        const step = steps.find((s) => String(s.id) === String(stepId))
        if (step) {
          setForm({
            name: step.name || '',
            subject: step.subject || '',
            html_body: step.html_body || '',
          })
        }
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to load step')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [funnelId, stepId])

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleTestSend = async () => {
    setSendingTest(true)
    try {
      await testSendStep(stepId, { subject: form.subject, html_body: form.html_body })
      toast.success('Test email sent to you')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send test email')
    } finally {
      setSendingTest(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateStep(stepId, {
        name: form.name,
        subject: form.subject,
        html_body: form.html_body,
      })
      toast.success('Step saved')
      navigate(`/admin/crm/funnels/${funnelId}`)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save step')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <PageLoader label="Loading step" />
  }

  if (!form) {
    return (
      <EmptyState
        title="Step not found"
        action={
          <Link
            to={`/admin/crm/funnels/${funnelId}`}
            className="text-sm font-medium text-optio-purple hover:underline"
          >
            Back to funnel
          </Link>
        }
      />
    )
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <Link
            to={`/admin/crm/funnels/${funnelId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-optio-purple transition-colors mb-2"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {funnelName || 'Back to funnel'}
          </Link>
          <h2 className="text-2xl font-bold">Edit email</h2>
        </div>
        <button
          onClick={handleTestSend}
          disabled={sendingTest}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[44px] flex-shrink-0"
        >
          {sendingTest ? 'Sending...' : 'Send test to me'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="step-name" className="block text-sm font-medium text-gray-700 mb-1">
              Step name
            </label>
            <input
              id="step-name"
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="step-subject" className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              id="step-subject"
              type="text"
              value={form.subject}
              onChange={(e) => setField('subject', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <HtmlEmailEditor value={form.html_body} onChange={(html) => setField('html_body', html)} />

        <FormFooter
          onCancel={() => navigate(`/admin/crm/funnels/${funnelId}`)}
          onSubmit={handleSave}
          submitText="Save step"
          isSubmitting={saving}
        />
      </div>
    </div>
  )
}

export default StepEditor
