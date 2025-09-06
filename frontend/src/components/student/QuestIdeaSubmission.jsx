import React, { useState } from 'react'
import { X, Lightbulb, Sparkles, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const QuestIdeaSubmission = ({ isOpen, onClose, onSubmissionSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('input') // 'input', 'ai-preview', 'submitting', 'success'
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    use_ai_enhancement: true
  })
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [submissionResult, setSubmissionResult] = useState(null)

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handlePreviewWithAI = async () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      toast.error('Please fill in both title and description')
      return
    }

    if (!formData.use_ai_enhancement) {
      // Skip AI preview and go straight to submission
      handleSubmit()
      return
    }

    setLoading(true)

    try {
      const response = await api.post('/api/v3/quest-ai/enhance-student-idea', {
        title: formData.title,
        description: formData.description
      })

      if (response.data.success) {
        setAiSuggestions(response.data.suggestions)
        setStep('ai-preview')
        toast.success('AI suggestions generated!')
      } else {
        toast.error('Failed to generate AI suggestions')
        // Continue without AI
        handleSubmit()
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error)
      toast.error('AI enhancement unavailable, submitting without suggestions')
      // Continue without AI
      handleSubmit()
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (useAiSuggestions = formData.use_ai_enhancement) => {
    setLoading(true)
    setStep('submitting')

    try {
      const submissionData = {
        title: formData.title,
        description: formData.description,
        use_ai_enhancement: useAiSuggestions
      }

      const response = await api.post('/quest-ideas', submissionData)

      setSubmissionResult({
        message: response.data.message,
        idea_id: response.data.idea_id,
        ai_suggestions: response.data.ai_suggestions
      })
      
      setStep('success')
      toast.success('Quest idea submitted successfully!')
      
      // Notify parent component
      if (onSubmissionSuccess) {
        onSubmissionSuccess(response.data)
      }
    } catch (error) {
      console.error('Error submitting quest idea:', error)
      toast.error(error.response?.data?.error || 'Failed to submit quest idea')
      setStep(aiSuggestions ? 'ai-preview' : 'input')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep('input')
    setFormData({
      title: '',
      description: '',
      use_ai_enhancement: true
    })
    setAiSuggestions(null)
    setSubmissionResult(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-lg">
              <Lightbulb className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Submit Quest Idea</h2>
              <p className="text-sm text-gray-600">Share your learning quest ideas with our team</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {step === 'input' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-blue-900">Got a learning quest idea?</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      We love student-driven learning! Share your idea and our AI will help develop it into a structured quest with specific tasks and learning outcomes.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-800">
                  Quest Title
                  <span className="text-red-500 font-bold ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="e.g., Learn to Code a Mobile App, Master Photography Basics"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  maxLength={200}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Give your quest idea a catchy, descriptive title
                  </p>
                  <p className="text-xs text-gray-400">
                    {formData.title.length}/200
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-800">
                  Description & Learning Goals
                  <span className="text-red-500 font-bold ml-1">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe what you want to learn and why. What skills would you gain? What would you create or accomplish? Include any specific topics or activities you're interested in."
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  maxLength={1000}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Be specific about what you want to learn and achieve
                  </p>
                  <p className="text-xs text-gray-400">
                    {formData.description.length}/1000
                  </p>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="ai-enhancement"
                    checked={formData.use_ai_enhancement}
                    onChange={(e) => handleInputChange('use_ai_enhancement', e.target.checked)}
                    className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500 border-purple-300 rounded"
                  />
                  <div className="flex-1">
                    <label htmlFor="ai-enhancement" className="font-medium text-purple-900 cursor-pointer">
                      <Sparkles className="h-4 w-4 inline mr-2" />
                      Use AI Enhancement
                    </label>
                    <p className="text-sm text-purple-700 mt-1">
                      Let our AI help structure your idea into specific learning tasks with clear outcomes and evidence requirements. This helps our team better understand your vision and develop it faster.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handlePreviewWithAI}
                disabled={loading || !formData.title.trim() || !formData.description.trim()}
                className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-3 px-6 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : formData.use_ai_enhancement ? (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>Preview with AI Enhancement</span>
                  </>
                ) : (
                  <span>Submit Quest Idea</span>
                )}
              </button>
            </div>
          )}

          {step === 'ai-preview' && aiSuggestions && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <Sparkles className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">AI Enhancement Complete!</span>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  Review the AI-generated improvements below, then submit your enhanced quest idea.
                </p>
              </div>

              {/* Enhanced Description */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Enhanced Description</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Your Original</h4>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                      {aiSuggestions.original_description}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-purple-600 mb-2">AI Enhanced</h4>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700">
                      {aiSuggestions.enhanced_description}
                    </div>
                  </div>
                </div>
              </div>

              {/* Suggested Tasks */}
              {aiSuggestions.suggested_tasks && aiSuggestions.suggested_tasks.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">
                    AI-Suggested Learning Tasks ({aiSuggestions.suggested_tasks.length})
                  </h3>
                  <div className="space-y-3">
                    {aiSuggestions.suggested_tasks.map((task, index) => (
                      <div key={index} className="bg-white border border-purple-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{task.title}</h4>
                          <div className="flex items-center space-x-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              {task.pillar}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {task.xp_value} XP
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                        {task.evidence_prompt && (
                          <p className="text-xs text-gray-500">
                            <strong>Evidence:</strong> {task.evidence_prompt}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-blue-900">Total Estimated XP:</span>
                      <span className="text-lg font-bold text-blue-600">
                        {aiSuggestions.suggested_tasks.reduce((total, task) => total + (task.xp_value || 0), 0)} XP
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleSubmit(true)}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-3 px-6 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Submit Enhanced Quest Idea
                </button>
                <button
                  onClick={() => setStep('input')}
                  className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back to Edit
                </button>
              </div>
            </div>
          )}

          {step === 'submitting' && (
            <div className="text-center py-12">
              <div className="mb-4">
                <Loader2 className="h-12 w-12 text-purple-500 mx-auto animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Submitting Your Quest Idea</h3>
              <p className="text-gray-600">
                Please wait while we save your idea and suggestions...
              </p>
            </div>
          )}

          {step === 'success' && submissionResult && (
            <div className="text-center py-12">
              <div className="mb-4">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Quest Idea Submitted!</h3>
              <p className="text-gray-600 mb-6">
                {submissionResult.message}
              </p>
              
              {submissionResult.ai_suggestions && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6 text-left">
                  <div className="flex items-center space-x-2 mb-2">
                    <Sparkles className="h-5 w-5 text-purple-600" />
                    <span className="font-medium text-purple-900">AI Enhancement Included</span>
                  </div>
                  <p className="text-sm text-purple-700">
                    Your idea includes AI-generated task suggestions and improvements that will help our team develop it into a complete quest faster.
                  </p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-left">
                    <h4 className="font-medium text-blue-900">What happens next?</h4>
                    <ul className="text-sm text-blue-700 mt-1 space-y-1">
                      <li>• Our team will review your idea and AI suggestions</li>
                      <li>• We'll develop it into a complete quest with tasks and evidence requirements</li>
                      <li>• You'll be notified when your quest is approved and available</li>
                      <li>• You'll be among the first to try your own quest idea!</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                onClick={handleClose}
                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-3 px-8 rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuestIdeaSubmission