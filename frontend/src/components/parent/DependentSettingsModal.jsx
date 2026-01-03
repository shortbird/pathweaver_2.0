import React, { useState, useEffect } from 'react'
import { XMarkIcon, KeyIcon, SparklesIcon, EyeIcon, EyeSlashIcon, ChatBubbleLeftRightIcon, LightBulbIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { addDependentLogin, toggleDependentAIAccess, updateDependentAIFeatures } from '../../services/dependentAPI'
import toast from 'react-hot-toast'

/**
 * Modal for managing child settings (both dependents and linked students):
 * - Add login credentials (email/password) - only for dependents
 * - Toggle AI features access - for all children
 * - Granular AI feature controls (chatbot, lesson helper, task generation)
 *
 * Props:
 *   - child: The child data object (either dependent or linked student)
 *   - isDependent: true if this is a dependent (under 13), false for linked students
 *   - orgLimits: Optional org-level AI feature limits (what the org allows)
 */
const DependentSettingsModal = ({ isOpen, onClose, dependent, child, isDependent = true, onUpdate, orgLimits = null }) => {
  // Support both 'dependent' (legacy) and 'child' props
  const childData = child || dependent
  const showLoginTab = isDependent

  const [activeTab, setActiveTab] = useState(showLoginTab ? 'login' : 'ai')
  const [loading, setLoading] = useState(false)
  const [featureLoading, setFeatureLoading] = useState(false)

  // Login form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // AI toggle state - master toggle
  const [aiEnabled, setAiEnabled] = useState(childData?.ai_features_enabled || false)

  // Granular AI feature toggles
  const [chatbotEnabled, setChatbotEnabled] = useState(childData?.ai_chatbot_enabled ?? true)
  const [lessonHelperEnabled, setLessonHelperEnabled] = useState(childData?.ai_lesson_helper_enabled ?? true)
  const [taskGenerationEnabled, setTaskGenerationEnabled] = useState(childData?.ai_task_generation_enabled ?? true)

  // Default org limits if not provided
  const effectiveOrgLimits = orgLimits || {
    chatbot: true,
    lesson_helper: true,
    task_generation: true
  }

  // Reset tab and state when modal opens with different child type
  useEffect(() => {
    if (isOpen && childData) {
      setActiveTab(showLoginTab ? 'login' : 'ai')
      setAiEnabled(childData?.ai_features_enabled || false)
      setChatbotEnabled(childData?.ai_chatbot_enabled ?? true)
      setLessonHelperEnabled(childData?.ai_lesson_helper_enabled ?? true)
      setTaskGenerationEnabled(childData?.ai_task_generation_enabled ?? true)
    }
  }, [isOpen, showLoginTab, childData])

  if (!isOpen || !childData) return null

  // Get child ID - could be 'id' (dependent) or 'student_id' (linked student)
  const childId = childData.id || childData.student_id
  const childName = childData.display_name || childData.student_name || 'Child'

  const hasLogin = childData.email && !childData.email.endsWith('@optio-internal-placeholder.local')

  const validatePassword = (pwd) => {
    const errors = []
    if (pwd.length < 12) errors.push('At least 12 characters')
    if (!/[A-Z]/.test(pwd)) errors.push('One uppercase letter')
    if (!/[a-z]/.test(pwd)) errors.push('One lowercase letter')
    if (!/[0-9]/.test(pwd)) errors.push('One number')
    if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pwd)) errors.push('One special character')
    return errors
  }

  const passwordErrors = validatePassword(password)
  const isPasswordValid = passwordErrors.length === 0

  const handleAddLogin = async (e) => {
    e.preventDefault()

    if (!email || !password) {
      toast.error('Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (!isPasswordValid) {
      toast.error('Password does not meet requirements')
      return
    }

    setLoading(true)
    try {
      await addDependentLogin(childId, { email, password })
      toast.success(`Login credentials added for ${childName}`)
      onUpdate?.()
      onClose()
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to add login credentials'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleAI = async () => {
    const newValue = !aiEnabled
    setLoading(true)
    try {
      await toggleDependentAIAccess(childId, newValue)
      setAiEnabled(newValue)
      toast.success(`AI features ${newValue ? 'enabled' : 'disabled'} for ${childName}`)
      onUpdate?.()
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to update AI access'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleFeature = async (feature, currentValue, setter) => {
    // Check if org allows this feature
    const orgKey = feature === 'lesson_helper' ? 'lesson_helper' : feature
    if (!effectiveOrgLimits[orgKey]) {
      toast.error('This feature is disabled by your organization')
      return
    }

    const newValue = !currentValue
    setFeatureLoading(true)
    try {
      await updateDependentAIFeatures(childId, { [feature]: newValue })
      setter(newValue)
      const featureNames = {
        chatbot: 'AI Tutor',
        lesson_helper: 'Lesson Helper',
        task_generation: 'Task Suggestions'
      }
      toast.success(`${featureNames[feature]} ${newValue ? 'enabled' : 'disabled'}`)
      onUpdate?.()
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to update feature'
      toast.error(message)
    } finally {
      setFeatureLoading(false)
    }
  }

  const FeatureToggle = ({ label, description, icon: Icon, enabled, orgAllowed, onToggle, disabled }) => {
    const isDisabledByOrg = !orgAllowed

    return (
      <div className={`p-4 border rounded-lg ${isDisabledByOrg ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${isDisabledByOrg ? 'bg-gray-200' : 'bg-optio-purple/10'}`}>
            <Icon className={`w-5 h-5 ${isDisabledByOrg ? 'text-gray-400' : 'text-optio-purple'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className={`font-medium ${isDisabledByOrg ? 'text-gray-400' : 'text-gray-900'}`}>
                {label}
              </span>
              <button
                onClick={onToggle}
                disabled={disabled || isDisabledByOrg}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  enabled && orgAllowed ? 'bg-optio-purple' : 'bg-gray-300'
                } ${disabled || isDisabledByOrg ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    enabled && orgAllowed ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className={`text-xs ${isDisabledByOrg ? 'text-gray-400' : 'text-gray-500'}`}>
              {isDisabledByOrg ? 'Disabled by organization' : description}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Settings for {childName}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Tabs - only show if login tab is available */}
          {showLoginTab ? (
            <div className="flex border-b border-gray-200 mb-6">
              <button
                onClick={() => setActiveTab('login')}
                className={`flex items-center gap-2 px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'login'
                    ? 'border-optio-purple text-optio-purple'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <KeyIcon className="w-4 h-4" />
                Login Access
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-2 px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'ai'
                    ? 'border-optio-purple text-optio-purple'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <SparklesIcon className="w-4 h-4" />
                AI Features
              </button>
            </div>
          ) : (
            <div className="mb-6">
              <div className="flex items-center gap-2 text-optio-purple font-medium">
                <SparklesIcon className="w-4 h-4" />
                AI Features
              </div>
            </div>
          )}

          {/* Login Tab */}
          {activeTab === 'login' && showLoginTab && (
            <div>
              {hasLogin ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <KeyIcon className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Login Already Set Up</h3>
                  <p className="text-sm text-gray-600">
                    {childName} can log in with: <br />
                    <span className="font-medium">{childData.email}</span>
                  </p>
                </div>
              ) : (
                <form onSubmit={handleAddLogin} className="space-y-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Give {childName} their own login so they can access Optio independently.
                    You will still have full oversight of their account.
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                      placeholder="child@example.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent pr-10"
                        placeholder="Create a strong password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                      </button>
                    </div>
                    {password && passwordErrors.length > 0 && (
                      <ul className="mt-2 text-xs text-red-600 space-y-1">
                        {passwordErrors.map((error, i) => (
                          <li key={i}>- {error}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                      placeholder="Confirm password"
                      required
                    />
                    {confirmPassword && password !== confirmPassword && (
                      <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !isPasswordValid || password !== confirmPassword}
                    className="w-full py-2 px-4 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Creating Login...' : 'Create Login'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* AI Tab */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              {/* Master Toggle */}
              <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0">
                  <SparklesIcon className="w-8 h-8 text-optio-purple" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">AI Features</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Enable AI-powered learning assistance for {childName}.
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      AI Features {aiEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <button
                      onClick={handleToggleAI}
                      disabled={loading}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        aiEnabled ? 'bg-optio-purple' : 'bg-gray-300'
                      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          aiEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Granular Controls - only shown when master toggle is ON */}
              {aiEnabled && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 font-medium">Individual Features</p>

                  <FeatureToggle
                    label="AI Tutor"
                    description="Educational conversations with an AI tutor that adapts to their learning style."
                    icon={ChatBubbleLeftRightIcon}
                    enabled={chatbotEnabled}
                    orgAllowed={effectiveOrgLimits.chatbot}
                    onToggle={() => handleToggleFeature('chatbot', chatbotEnabled, setChatbotEnabled)}
                    disabled={featureLoading}
                  />

                  <FeatureToggle
                    label="Lesson Helper"
                    description="AI assistance within lessons to explain concepts and provide different perspectives."
                    icon={LightBulbIcon}
                    enabled={lessonHelperEnabled}
                    orgAllowed={effectiveOrgLimits.lesson_helper}
                    onToggle={() => handleToggleFeature('lesson_helper', lessonHelperEnabled, setLessonHelperEnabled)}
                    disabled={featureLoading}
                  />

                  <FeatureToggle
                    label="Task Suggestions"
                    description="AI recommends tasks and provides feedback on quest ideas."
                    icon={ClipboardDocumentListIcon}
                    enabled={taskGenerationEnabled}
                    orgAllowed={effectiveOrgLimits.task_generation}
                    onToggle={() => handleToggleFeature('task_generation', taskGenerationEnabled, setTaskGenerationEnabled)}
                    disabled={featureLoading}
                  />
                </div>
              )}

              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Privacy Note:</strong> When AI features are enabled, your child's learning
                  activity (questions, quest ideas) may be sent to Google for AI processing.
                  You can disable this at any time.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DependentSettingsModal
