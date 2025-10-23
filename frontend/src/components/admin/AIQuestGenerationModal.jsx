import React, { useState } from 'react'
import { X, Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const AIQuestGenerationModal = ({ isOpen, onClose, onQuestGenerated }) => {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('input') // 'input', 'generating', 'result'
  const [formData, setFormData] = useState({
    topic: '',
    learning_objectives: ''
  })
  const [generatedQuest, setGeneratedQuest] = useState(null)


  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleGenerate = async () => {
    if (!formData.topic.trim()) {
      toast.error('Please enter a topic to generate a quest')
      return
    }

    setLoading(true)
    setStep('generating')

    try {
      const response = await api.post('/api/v3/quest-ai/generate', {
        topic: formData.topic,
        learning_objectives: formData.learning_objectives || null
      })

      if (response.data.success) {
        setGeneratedQuest(response.data.quest)
        setStep('result')
        toast.success('Quest generated successfully!')
      } else {
        toast.error(response.data.error || 'Failed to generate quest')
        setStep('input')
      }
    } catch (error) {
      console.error('Error generating quest:', error)
      toast.error(error.response?.data?.error || 'Failed to generate quest')
      setStep('input')
    } finally {
      setLoading(false)
    }
  }

  const handleUseQuest = () => {
    if (generatedQuest && onQuestGenerated) {
      onQuestGenerated(generatedQuest)
      onClose()
    }
  }

  const handleRegenerate = () => {
    setStep('input')
    setGeneratedQuest(null)
  }

  const handleClose = () => {
    setStep('input')
    setGeneratedQuest(null)
    setFormData({
      topic: '',
      learning_objectives: ''
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r bg-gradient-primary-reverse rounded-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">AI Quest Generator</h2>
              <p className="text-sm text-gray-600">Generate a complete quest from your topic</p>
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
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-800">
                  Quest Topic
                  <span className="text-red-500 font-bold ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={formData.topic}
                  onChange={(e) => handleInputChange('topic', e.target.value)}
                  placeholder="e.g., Solar System Exploration, Creative Writing, Personal Finance"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter any topic, subject, or skill you want to create a quest about
                </p>
              </div>


              <div>
                <label className="block text-sm font-medium mb-2 text-gray-600">
                  Learning Objectives
                  <span className="text-xs text-gray-400 ml-1">(Optional)</span>
                </label>
                <textarea
                  value={formData.learning_objectives}
                  onChange={(e) => handleInputChange('learning_objectives', e.target.value)}
                  placeholder="e.g., Students will understand planetary motion, develop research skills, and create visual presentations"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Specific goals or outcomes you want students to achieve
                </p>
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading || !formData.topic.trim()}
                className="w-full bg-gradient-to-r bg-gradient-primary-reverse text-white py-3 px-6 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center space-x-2"
              >
                <Sparkles className="h-5 w-5" />
                <span>Generate Quest with AI</span>
              </button>
            </div>
          )}

          {step === 'generating' && (
            <div className="text-center py-12">
              <div className="mb-4">
                <Loader2 className="h-12 w-12 text-purple-500 mx-auto animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Generating Your Quest</h3>
              <p className="text-gray-600">
                AI is creating an engaging quest based on "{formData.topic}"...
              </p>
              <div className="mt-4 text-sm text-gray-500">
                This usually takes 10-30 seconds
              </div>
            </div>
          )}

          {step === 'result' && generatedQuest && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <Sparkles className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">Quest Generated Successfully!</span>
                </div>
              </div>

              {/* Quest Preview */}
              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{generatedQuest.title}</h3>
                  <p className="text-gray-700">{generatedQuest.big_idea}</p>
                </div>

                {generatedQuest.tasks && generatedQuest.tasks.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-3">
                      Generated Tasks ({generatedQuest.tasks.length})
                    </h4>
                    <div className="space-y-3">
                      {generatedQuest.tasks.map((task, index) => (
                        <div key={index} className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="flex items-start justify-between mb-2">
                            <h5 className="font-medium text-gray-900">{task.title}</h5>
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
                          
                          {/* School Subjects Display */}
                          {task.school_subjects && task.school_subjects.length > 0 && (
                            <div className="mb-2">
                              <span className="text-xs font-medium text-gray-700 mr-2">Diploma Credit:</span>
                              {task.school_subjects.map((subject, idx) => {
                                const subjectNames = {
                                  'language_arts': 'Language Arts',
                                  'math': 'Math',
                                  'science': 'Science',
                                  'social_studies': 'Social Studies',
                                  'financial_literacy': 'Financial Literacy',
                                  'health': 'Health',
                                  'pe': 'PE',
                                  'fine_arts': 'Fine Arts',
                                  'cte': 'CTE',
                                  'digital_literacy': 'Digital Literacy',
                                  'electives': 'Electives'
                                };
                                return (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-2 py-1 mr-1 mb-1 text-xs font-medium bg-green-100 text-green-700 rounded-md"
                                  >
                                    {subjectNames[subject] || subject}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          
                          {task.evidence_prompt && (
                            <p className="text-xs text-gray-500">
                              <strong>Evidence:</strong> {task.evidence_prompt}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total XP Display */}
                {generatedQuest.tasks && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                    <span className="font-medium text-blue-900">Total Quest XP:</span>
                    <span className="text-lg font-bold text-blue-600">
                      {generatedQuest.tasks.reduce((total, task) => total + (task.xp_value || 0), 0)} XP
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleUseQuest}
                  className="flex-1 bg-gradient-to-r bg-gradient-primary-reverse text-white py-3 px-6 rounded-lg font-semibold hover:opacity-90 transition-opacity"
                >
                  Use This Quest
                </button>
                <button
                  onClick={handleRegenerate}
                  className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Generate Again</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AIQuestGenerationModal