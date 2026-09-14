import React, { useState, useEffect } from 'react'
import { KeyIcon, SparklesIcon, EyeIcon, EyeSlashIcon, ChatBubbleLeftRightIcon, LightBulbIcon, ClipboardDocumentListIcon, LockClosedIcon, UserIcon } from '@heroicons/react/24/outline'
import { addDependentLogin, toggleDependentAIAccess, updateDependentAIFeatures, updateChildName } from '../../services/dependentAPI'
import toast from 'react-hot-toast'
import ChildAvatarUpload from './ChildAvatarUpload'
import ChildPrivacyCard from './ChildPrivacyCard'

/**
 * One child's settings -- a tab of Family Settings (FamilySettingsModal),
 * not a modal of its own.
 *
 * Until 2026-09-15 this was DependentSettingsModal: Family Settings had a
 * "Children" tab that listed the kids, each with a gear that closed Family
 * Settings and opened THIS as a second modal with four tabs of its own,
 * one of which (Observers) repeated a tab the first modal already had.
 * Two modals and nine tabs for one family. Now Family Settings has one tab
 * per child, and the child's settings sit in it as plain sections in a
 * single scroll:
 *
 * - Profile (first/last name, avatar) -- for BOTH kinds of child. It was
 *   dependents-only until 2026-08-25, when a Hearthwood parent wrote in
 *   about her son being in the system as "Hanna Nathan": the tab told her
 *   he could fix it himself in his account settings, which is not a thing a
 *   guardian correcting a roster-import mistake can act on.
 * - Login (email/password) -- dependents only; a linked student has one.
 * - AI features -- the master switch and the three per-feature switches.
 * - Privacy -- who may see this child's portfolio (ChildPrivacyCard, which
 *   used to be Family Settings' own "Privacy" tab, one card per child).
 *
 * Observers are NOT here: the family Observers tab lists every observer
 * with a per-child access switch, which is the same control at the family
 * grain.
 *
 * Props:
 *   - child: the row as its endpoint returned it (dependent or linked)
 *   - isDependent: true for a managed under-13 profile
 *   - orgLimits: optional org-level AI feature limits (what the org allows)
 *   - onUpdate: called after any save, so the family list refetches
 */
// Module-level on purpose: a component defined inside the panel body gets a
// new identity every render, which remounts its subtree -- and an input that
// remounts on every keystroke loses focus after one character.
function Section({ icon: Icon, title, children }) {
  return (
    <section className="pt-6 first:pt-0">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-optio-purple" />
        {title}
      </h3>
      {children}
    </section>
  )
}

function FeatureToggle({ label, description, icon: Icon, enabled, orgAllowed, onToggle, disabled }) {
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

const ChildSettingsPanel = ({ child, isDependent = true, onUpdate, orgLimits = null }) => {
  const childData = child
  const showLogin = isDependent

  const [loading, setLoading] = useState(false)
  const [featureLoading, setFeatureLoading] = useState(false)

  // Profile form state. First and last separately, because the whole point of
  // this form is that they can be the wrong way round.
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

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

  // Reseed the form when the panel is pointed at a different child.
  useEffect(() => {
    if (childData) {
      setFirstName(childData?.first_name || childData?.student_first_name || '')
      setLastName(childData?.last_name || childData?.student_last_name || '')
      setAiEnabled(childData?.ai_features_enabled || false)
      setChatbotEnabled(childData?.ai_chatbot_enabled ?? true)
      setLessonHelperEnabled(childData?.ai_lesson_helper_enabled ?? true)
      setTaskGenerationEnabled(childData?.ai_task_generation_enabled ?? true)
      // Reset login form
      setEmail('')
      setPassword('')
      setConfirmPassword('')
    }
  }, [childData])

  if (!childData) return null

  // Get child ID - could be 'id' (dependent) or 'student_id' (linked student)
  const childId = childData.id || childData.student_id
  // Get child name - handle different field names for dependents vs linked students
  const childName = `${childData.first_name || ''} ${childData.last_name || ''}`.trim() ||
    childData.display_name || childData.student_name ||
    (childData.student_first_name ? `${childData.student_first_name} ${childData.student_last_name || ''}`.trim() : null) ||
    'Child'
  const childFirstName = childName.split(' ')[0]

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

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First and last name are both required')
      return
    }

    setLoading(true)
    try {
      await updateChildName(childId, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
      toast.success('Name updated')
      onUpdate?.()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update the name')
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

  return (
    <div className="divide-y divide-gray-100">
          <Section icon={UserIcon} title="Profile">
            <div className="space-y-6">
              {/* The same picture control as the child's card on /family. Linked
                  students arrive from /my-children, which names the field
                  student_avatar_url; dependents carry avatar_url. */}
              <div className="flex justify-center">
                <ChildAvatarUpload
                  childId={childId}
                  name={childName}
                  avatarUrl={childData?.avatar_url || childData?.student_avatar_url || null}
                  size="lg"
                  onUploaded={() => onUpdate?.()}
                />
              </div>
              <p className="text-center text-sm text-gray-500">Click to upload a profile picture</p>

              {/* Name. Editable for every child a guardian is responsible for. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="child-first-name" className="block text-sm font-medium text-gray-700 mb-1">
                    First name
                  </label>
                  <input
                    id="child-first-name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label htmlFor="child-last-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Last name
                  </label>
                  <input
                    id="child-last-name"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    placeholder="Last name"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 -mt-4">
                This is how {firstName || 'your child'} appears everywhere in Optio. If a school
                roster put the names the wrong way round, swap them here.
              </p>

              <button
                onClick={handleSaveProfile}
                disabled={loading || !firstName.trim() || !lastName.trim()}
                className="btn-primary w-full"
              >
                {loading ? 'Saving...' : 'Save name'}
              </button>

            </div>
          </Section>

          {showLogin && (
          <Section icon={KeyIcon} title="Login">
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
                    className="btn-primary w-full"
                  >
                    {loading ? 'Creating Login...' : 'Create Login'}
                  </button>
                </form>
              )}
            </div>
          </Section>
          )}

          <Section icon={SparklesIcon} title="AI features">
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
          </Section>

          <Section icon={LockClosedIcon} title="Privacy">
            <ChildPrivacyCard studentId={childId} studentName={childFirstName} />
          </Section>
    </div>
  )
}

export default ChildSettingsPanel

