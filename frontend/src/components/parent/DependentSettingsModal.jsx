import React, { useState, useEffect, useRef } from 'react'
import { XMarkIcon, KeyIcon, SparklesIcon, EyeIcon, EyeSlashIcon, ChatBubbleLeftRightIcon, LightBulbIcon, ClipboardDocumentListIcon, UserIcon, UserGroupIcon, TrashIcon, LinkIcon, ClipboardDocumentIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { addDependentLogin, toggleDependentAIAccess, updateDependentAIFeatures, updateDependent } from '../../services/dependentAPI'
import { observerAPI } from '../../services/api'
import api from '../../services/api'
import toast from 'react-hot-toast'

/**
 * Modal for managing child settings (both dependents and linked students):
 * - Profile editing (name, avatar) - for dependents
 * - Add login credentials (email/password) - only for dependents
 * - Toggle AI features access - for all children
 * - Granular AI feature controls (chatbot, lesson helper, task generation)
 * - Observer management - see and manage who can observe this student
 *
 * Props:
 *   - child: The child data object (either dependent or linked student)
 *   - isDependent: true if this is a dependent (under 13), false for linked students
 *   - orgLimits: Optional org-level AI feature limits (what the org allows)
 */
const DependentSettingsModal = ({ isOpen, onClose, dependent, child, isDependent = true, onUpdate, orgLimits = null, onActAs }) => {
  // Support both 'dependent' (legacy) and 'child' props
  const childData = child || dependent
  const showLoginTab = isDependent
  const showProfileTab = true // Show profile tab for all children (avatar upload)

  const [activeTab, setActiveTab] = useState(showProfileTab ? 'profile' : 'ai')
  const [loading, setLoading] = useState(false)
  const [featureLoading, setFeatureLoading] = useState(false)

  // Profile form state
  const [displayName, setDisplayName] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

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

  // Observer state
  const [observers, setObservers] = useState([])
  const [observersLoading, setObserversLoading] = useState(false)
  const [activeInvite, setActiveInvite] = useState(null)
  const [creatingInvite, setCreatingInvite] = useState(false)

  // Default org limits if not provided
  const effectiveOrgLimits = orgLimits || {
    chatbot: true,
    lesson_helper: true,
    task_generation: true
  }

  // Reset tab and state when modal opens with different child type
  useEffect(() => {
    if (isOpen && childData) {
      setActiveTab(showProfileTab ? 'profile' : 'ai')
      setDisplayName(childData?.display_name || childData?.student_name || '')
      setPreviewUrl(childData?.avatar_url || null)
      setAiEnabled(childData?.ai_features_enabled || false)
      setChatbotEnabled(childData?.ai_chatbot_enabled ?? true)
      setLessonHelperEnabled(childData?.ai_lesson_helper_enabled ?? true)
      setTaskGenerationEnabled(childData?.ai_task_generation_enabled ?? true)
      // Reset login form
      setEmail('')
      setPassword('')
      setConfirmPassword('')
    }
  }, [isOpen, showProfileTab, childData])

  // Load observers when observers tab is selected
  useEffect(() => {
    if (isOpen && activeTab === 'observers' && childData) {
      loadObservers()
    }
  }, [isOpen, activeTab, childData])

  const loadObservers = async () => {
    const childId = childData.id || childData.student_id
    if (!childId) return

    setObserversLoading(true)
    try {
      const [observersRes, invitesRes] = await Promise.all([
        observerAPI.getObserversForStudent(childId),
        observerAPI.getParentInvitations(childId)
      ])
      setObservers(observersRes.data.observers || [])
      // Get the most recent pending invitation (if any)
      const invites = invitesRes.data.invitations || []
      if (invites.length > 0) {
        const invite = invites[0]
        const inviteUrl = invite.invite_url || `${window.location.origin}/observer/accept/${invite.invitation_code}`
        setActiveInvite({ ...invite, url: inviteUrl })
      } else {
        setActiveInvite(null)
      }
    } catch (error) {
      console.error('Error loading observers:', error)
      toast.error('Failed to load observers')
    } finally {
      setObserversLoading(false)
    }
  }

  if (!isOpen || !childData) return null

  // Get child ID - could be 'id' (dependent) or 'student_id' (linked student)
  const childId = childData.id || childData.student_id
  // Get child name - handle different field names for dependents vs linked students
  const childName = childData.display_name || childData.student_name ||
    (childData.student_first_name ? `${childData.student_first_name} ${childData.student_last_name || ''}`.trim() : null) ||
    'Child'
  const firstName = childName.split(' ')[0]

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

  // Profile handlers
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }

    // Show preview
    const reader = new FileReader()
    reader.onload = (e) => setPreviewUrl(e.target.result)
    reader.readAsDataURL(file)

    // Upload to server
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)

      // Upload avatar - use parent endpoint for both dependents and linked students
      const response = await api.post(`/api/parent/child/${childId}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      if (response.data?.avatar_url) {
        setPreviewUrl(response.data.avatar_url)
        toast.success('Profile picture updated!')
        onUpdate?.()
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to upload image')
      setPreviewUrl(childData?.avatar_url || null)
    } finally {
      setUploading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      toast.error('Display name is required')
      return
    }

    setLoading(true)
    try {
      await updateDependent(childId, { display_name: displayName.trim() })
      toast.success('Profile updated!')
      onUpdate?.()
      onClose()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

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

  // Observer handlers
  const handleCreateOrRefreshInvite = async () => {
    setCreatingInvite(true)
    try {
      const response = await observerAPI.parentCreateInvite(childId, 'family')
      const data = response.data
      const inviteUrl = data.shareable_link || `${window.location.origin}/observer/accept/${data.invitation_code}`
      setActiveInvite({
        id: data.invitation_id,
        invitation_code: data.invitation_code,
        url: inviteUrl,
        created_at: new Date().toISOString()
      })
      toast.success(activeInvite ? 'Invite link refreshed!' : 'Invite link created!')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create invite')
    } finally {
      setCreatingInvite(false)
    }
  }

  const handleCopyInviteLink = async () => {
    if (activeInvite?.url) {
      await navigator.clipboard.writeText(activeInvite.url)
      toast.success('Link copied!')
    }
  }

  const handleRemoveObserver = async (linkId) => {
    if (!confirm('Remove this observer? They will no longer be able to see this student\'s portfolio.')) return

    try {
      await observerAPI.removeObserverFromStudent(childId, linkId)
      setObservers(observers.filter(o => o.link_id !== linkId))
      toast.success('Observer removed')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to remove observer')
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

  const initials = childName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  // Build tabs array
  const tabs = []
  if (showProfileTab) tabs.push({ id: 'profile', label: 'Profile', icon: UserIcon })
  if (showLoginTab) tabs.push({ id: 'login', label: 'Login', icon: KeyIcon })
  tabs.push({ id: 'ai', label: 'AI Features', icon: SparklesIcon })
  tabs.push({ id: 'observers', label: 'Observers', icon: UserGroupIcon })

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
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

          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-optio-purple text-optio-purple'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Profile Tab */}
          {activeTab === 'profile' && showProfileTab && (
            <div className="space-y-6">
              {/* Avatar Upload */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={uploading}
                  className="relative group"
                >
                  <div className="w-24 h-24 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center text-white font-bold text-2xl overflow-hidden">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      initials || '?'
                    )}
                  </div>
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploading ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </button>
              </div>
              <p className="text-center text-sm text-gray-500">Click to upload a profile picture</p>

              {/* Name Field - only editable for dependents */}
              {isDependent ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                      placeholder="Child's name"
                    />
                  </div>

                  <button
                    onClick={handleSaveProfile}
                    disabled={loading || !displayName.trim()}
                    className="w-full py-2 px-4 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Saving...' : 'Save Profile'}
                  </button>
                </>
              ) : (
                <div className="text-center text-sm text-gray-500">
                  <p className="font-medium text-gray-700 mb-1">{childName}</p>
                  <p>{childName} can update their own name in their account settings.</p>
                </div>
              )}

              {/* Act As Button - only for dependents */}
              {isDependent && onActAs && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-3">
                    Switch to {firstName}'s view to manage their quests and tasks directly.
                  </p>
                  <button
                    onClick={() => {
                      onActAs(childData)
                      onClose()
                    }}
                    className="w-full py-2 px-4 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 flex items-center justify-center gap-2"
                  >
                    <UserIcon className="w-5 h-5" />
                    Act As {firstName}
                  </button>
                </div>
              )}
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

          {/* Observers Tab */}
          {activeTab === 'observers' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Observers can view {childName}'s portfolio and leave encouraging comments on their work.
              </p>

              {observersLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
                </div>
              ) : (
                <>
                  {/* Invite Link Section */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-700">Invite Link</h4>
                      {activeInvite && (
                        <button
                          onClick={handleCreateOrRefreshInvite}
                          disabled={creatingInvite}
                          className="flex items-center gap-1 text-xs text-optio-purple hover:text-optio-pink transition-colors disabled:opacity-50"
                          title="Generate new link"
                        >
                          <ArrowPathIcon className={`w-3.5 h-3.5 ${creatingInvite ? 'animate-spin' : ''}`} />
                          Refresh
                        </button>
                      )}
                    </div>
                    {activeInvite ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={activeInvite.url}
                          readOnly
                          className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-600 truncate"
                        />
                        <button
                          onClick={handleCopyInviteLink}
                          className="flex-shrink-0 px-3 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg text-sm font-medium hover:opacity-90"
                        >
                          Copy
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleCreateOrRefreshInvite}
                        disabled={creatingInvite}
                        className="w-full py-2 px-4 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {creatingInvite ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <LinkIcon className="w-4 h-4" />
                            Create Invite Link
                          </>
                        )}
                      </button>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      Share this link with family members to let them observe {firstName}'s learning journey.
                    </p>
                  </div>

                  {/* Current Observers */}
                  {observers.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700">Current Observers</h4>
                      {observers.map((observer) => (
                        <div key={observer.link_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-optio-purple/20 flex items-center justify-center">
                              {observer.avatar_url ? (
                                <img src={observer.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                              ) : (
                                <UserIcon className="w-5 h-5 text-optio-purple" />
                              )}
                            </div>
                            <p className="font-medium text-gray-900 text-sm">
                              {observer.observer?.display_name || observer.observer?.email || 'Observer'}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemoveObserver(observer.link_id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove observer"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {observers.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      <p className="text-sm">No observers connected yet</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DependentSettingsModal
