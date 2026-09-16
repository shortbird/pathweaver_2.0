import React, { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KeyIcon, SparklesIcon, EyeIcon, EyeSlashIcon, ChatBubbleLeftRightIcon, LightBulbIcon, ClipboardDocumentListIcon, LockClosedIcon, UserIcon, UserGroupIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { addDependentLogin, toggleDependentAIAccess, updateDependentAIFeatures, updateChildName } from '../../services/dependentAPI'
import toast from 'react-hot-toast'
import * as friends from '../../services/friendsAPI'
import { forChild, useConnectionApprovals } from '../../hooks/api/useConnectionApprovals'
import ChildAvatarUpload from './ChildAvatarUpload'
import ChildPrivacyCard from './ChildPrivacyCard'
import ChildFriendsCard from './ChildFriendsCard'
import ChildConnections from './ChildConnections'

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
 * - Friends -- whether this child may have friends on Optio, and on what
 *   terms (ChildFriendsCard, 2026-09-16). The parent's consent lives here.
 *
 * Observers are NOT here: the family Observers tab lists every observer
 * with a per-child access switch, which is the same control at the family
 * grain.
 *
 * Each section is a collapsible row (2026-09-16): a heading, a one-line
 * summary of the current state, and a chevron. Until then the five sections
 * were laid out in full, one under the other, and a parent sent here by a
 * Friends notification scrolled past a centred portrait, a login form and
 * three AI cards to reach the switch. `initialSection` names the row to
 * open on arrival; the rest open on a click. The bodies stay mounted while
 * collapsed (hidden, not unrendered), so a half-typed name survives a
 * collapse and the summaries can read what their bodies load.
 *
 * Props:
 *   - child: the row as its endpoint returned it (dependent or linked)
 *   - isDependent: true for a managed under-13 profile
 *   - orgLimits: optional org-level AI feature limits (what the org allows)
 *   - onUpdate: called after any save, so the family list refetches
 *   - initialSection: 'profile' | 'login' | 'ai' | 'privacy' | 'friends'
 */
// Module-level on purpose: a component defined inside the panel body gets a
// new identity every render, which remounts its subtree -- and an input that
// remounts on every keystroke loses focus after one character.
function Section({ id, icon: Icon, title, summary, badge, open, onToggle, children }) {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon
  return (
    <section data-testid={`child-section-${id}`}>
      {/* The disclosure pattern: the heading holds the button, so the row
          is a heading to a screen reader and a button to a click. */}
      <h3 className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`child-section-${id}-body`}
          className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
        >
          <Icon className="w-6 h-6 text-optio-purple flex-shrink-0" />
          <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
            <span className="text-base font-semibold text-gray-900 flex-shrink-0">{title}</span>
            {summary && <span className="text-base font-normal text-gray-500 truncate min-w-0">{summary}</span>}
          </span>
          {badge > 0 && (
            <span className="rounded-full bg-optio-pink px-1.5 text-[10px] font-bold leading-4 text-white flex-shrink-0">
              {badge}
            </span>
          )}
          <Chevron className="w-5 h-5 text-gray-400 flex-shrink-0" />
        </button>
      </h3>
      <div id={`child-section-${id}-body`} className={open ? 'pb-6 pl-9' : 'hidden'} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

/** The Friends row's one-line summary: on/off, then friends and requests. */
function friendsSummary(policyData, pending, approved) {
  const policy = policyData?.policy
  if (!policy) return null
  if (policy.origin === 'module_off') return 'Not available at this school'
  if (!policy.enabled) return 'Off'
  const parts = ['On']
  if (approved > 0) parts.push(`${approved} friend${approved === 1 ? '' : 's'}`)
  if (pending > 0) parts.push(`${pending} request${pending === 1 ? '' : 's'} waiting`)
  if (policy.approval_mode === 'ask_first') parts.push('ask me first')
  return parts.join(' \u00b7 ')
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
          <p className={`text-sm ${isDisabledByOrg ? 'text-gray-400' : 'text-gray-500'}`}>
            {isDisabledByOrg ? 'Disabled by organization' : description}
          </p>
        </div>
      </div>
    </div>
  )
}

const SECTION_IDS = ['profile', 'login', 'ai', 'privacy', 'friends']

const ChildSettingsPanel = ({ child, isDependent = true, onUpdate, orgLimits = null, initialSection = null }) => {
  const childData = child
  const showLogin = isDependent

  const [loading, setLoading] = useState(false)
  const [featureLoading, setFeatureLoading] = useState(false)

  // Which rows are open. The one the caller asked for starts open; a click
  // toggles any row, and more than one may be open at once.
  const [openSections, setOpenSections] = useState(() =>
    new Set(SECTION_IDS.includes(initialSection) ? [initialSection] : []))
  const isOpen = (id) => openSections.has(id)
  const toggle = (id) => setOpenSections((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // The Privacy row's summary, reported by its card once it has loaded.
  const [privacy, setPrivacy] = useState(null)
  const onPrivacyStatus = useCallback((status, shares) => setPrivacy({ status, shares: shares || [] }), [])

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

  // Friends: the same react-query rows the card and the dashboard read.
  const { data: friendsPolicy } = useQuery({
    queryKey: ['connections', 'policy', childId],
    queryFn: () => friends.getChildPolicy(childId),
    enabled: !!childId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  })
  const { data: approvals } = useConnectionApprovals()
  const { pending, approved } = forChild(approvals, childId)

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

  const aiFeatureNames = [
    chatbotEnabled && effectiveOrgLimits.chatbot && 'AI Tutor',
    lessonHelperEnabled && effectiveOrgLimits.lesson_helper && 'Lesson Helper',
    taskGenerationEnabled && effectiveOrgLimits.task_generation && 'Task Suggestions',
  ].filter(Boolean)
  const aiSummary = aiEnabled
    ? (aiFeatureNames.length ? `On · ${aiFeatureNames.join(', ')}` : 'On')
    : 'Off'

  const privacyStatus = privacy?.status
  const activeShares = (privacy?.shares || []).filter((sh) => sh.is_active).length
  const privacySummary = !privacy ? null
    : !privacyStatus || privacyStatus.unknown ? 'Could not load the current setting'
    : [
      privacyStatus.is_public ? 'Portfolio public' : 'Portfolio private',
      activeShares > 0 && `${activeShares} transcript link${activeShares === 1 ? '' : 's'}`,
      privacyStatus.pending_parent_approval && 'request waiting',
    ].filter(Boolean).join(' · ')

  const inputClass = 'w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent'

  return (
    <div className="divide-y divide-gray-100">
      <Section id="profile" icon={UserIcon} title="Profile" summary={childName} open={isOpen('profile')} onToggle={() => toggle('profile')}>
        {/* The same picture control as the child's card on /family, beside
            the name rather than above it. Linked students arrive from
            /my-children, which names the field student_avatar_url;
            dependents carry avatar_url. */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <ChildAvatarUpload
            childId={childId}
            name={childName}
            avatarUrl={childData?.avatar_url || childData?.student_avatar_url || null}
            size="md"
            onUploaded={() => onUpdate?.()}
          />
          <div className="flex-1 min-w-0 space-y-3">
            {/* Name. Editable for every child a guardian is responsible for. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="child-first-name" className="block text-base font-medium text-gray-700 mb-1">
                  First name
                </label>
                <input
                  id="child-first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                  placeholder="First name"
                />
              </div>
              <div>
                <label htmlFor="child-last-name" className="block text-base font-medium text-gray-700 mb-1">
                  Last name
                </label>
                <input
                  id="child-last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                  placeholder="Last name"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-base text-gray-500">
                This is how {firstName || 'your child'} appears everywhere in Optio. Click the picture to change it.
                If a school roster put the names the wrong way round, swap them here.
              </p>
              <button
                onClick={handleSaveProfile}
                disabled={loading || !firstName.trim() || !lastName.trim()}
                className="btn-primary flex-shrink-0"
              >
                {loading ? 'Saving...' : 'Save name'}
              </button>
            </div>
          </div>
        </div>
      </Section>

      {showLogin && (
        <Section
          id="login"
          icon={KeyIcon}
          title="Login"
          summary={hasLogin ? childData.email : 'No login yet'}
          open={isOpen('login')}
          onToggle={() => toggle('login')}
        >
          {hasLogin ? (
            <p className="text-base text-gray-600">
              {childName} can log in with <span className="font-medium text-gray-900">{childData.email}</span>.
            </p>
          ) : (
            <form onSubmit={handleAddLogin} className="space-y-3">
              <p className="text-base text-gray-600">
                Give {childName} their own login so they can access Optio independently.
                You will still have full oversight of their account.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="child@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClass} pr-10`}
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
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    placeholder="Confirm password"
                    required
                  />
                </div>
              </div>
              {password && passwordErrors.length > 0 && (
                <p className="text-xs text-red-600">Password needs: {passwordErrors.join(', ').toLowerCase()}.</p>
              )}
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-600">Passwords do not match</p>
              )}

              <button
                type="submit"
                disabled={loading || !isPasswordValid || password !== confirmPassword}
                className="btn-primary"
              >
                {loading ? 'Creating Login...' : 'Create Login'}
              </button>
            </form>
          )}
        </Section>
      )}

      <Section id="ai" icon={SparklesIcon} title="AI features" summary={aiSummary} open={isOpen('ai')} onToggle={() => toggle('ai')}>
        <div className="space-y-4">
          {/* Master switch */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-base text-gray-600">
              AI-powered learning assistance for {childName}: a tutor to talk to, help inside lessons, and task ideas.
            </p>
            <button
              onClick={handleToggleAI}
              disabled={loading}
              role="switch"
              aria-checked={aiEnabled}
              aria-label={`AI features ${aiEnabled ? 'enabled' : 'disabled'}`}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
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

          {/* The three features, only while the master switch is on */}
          {aiEnabled && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
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

          <p className="text-sm text-gray-500">
            When AI features are on, {childFirstName}&rsquo;s questions and quest ideas may be sent to Google for
            AI processing. You can turn this off at any time.
          </p>
        </div>
      </Section>

      <Section
        id="privacy"
        icon={LockClosedIcon}
        title="Privacy"
        summary={privacySummary}
        badge={privacyStatus?.pending_parent_approval ? 1 : 0}
        open={isOpen('privacy')}
        onToggle={() => toggle('privacy')}
      >
        <ChildPrivacyCard studentId={childId} studentName={childFirstName} defaultExpanded onStatus={onPrivacyStatus} />
      </Section>

      {/* The policy first (whether requests come at all, and on what
          terms), then the requests waiting on the parent and the friends
          already approved. One section, because they are one decision. */}
      <Section
        id="friends"
        icon={UserGroupIcon}
        title="Friends"
        summary={friendsSummary(friendsPolicy, pending.length, approved.length)}
        badge={pending.length}
        open={isOpen('friends')}
        onToggle={() => toggle('friends')}
      >
        <ChildFriendsCard studentId={childId} studentName={childFirstName} />
        <ChildConnections childId={childId} />
      </Section>
    </div>
  )
}

export default ChildSettingsPanel

