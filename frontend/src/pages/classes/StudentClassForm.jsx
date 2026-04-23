import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import CreateQuestModal from '../../components/CreateQuestModal'
import {
  createClass,
  updateClass,
  getClass,
  submitForReview,
  returnToDraft,
  publishClass,
  buildUpdatePayload,
  getClassQuests,
  addQuestToClass,
  removeQuestFromClass,
  searchQuests,
  createInvite,
  listInvites,
  revokeInvite,
  buildInviteUrl,
  getKickoffAttendance,
  markKickoffAttended,
  uploadCoverImage,
  generateCoverImage,
  CREDIT_SUBJECTS,
  CREDIT_AMOUNTS,
} from '../../services/studentClassService'

const EMPTY_FORM = {
  title: '',
  description: '',
  kickoff_at: '',
  kickoff_meeting_url: '',
  credit_subject: '',
  credit_amount: 0.5,
  max_cohort_size: '',
}

const toDatetimeLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fromDatetimeLocal = (value) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const StatusBadge = ({ status }) => {
  const styles = {
    draft: 'bg-gray-100 text-gray-700',
    pending_review: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
    archived: 'bg-red-100 text-red-700',
  }
  const labels = {
    draft: 'Draft',
    pending_review: 'Pending review',
    published: 'Published',
    archived: 'Archived',
  }
  return (
    <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${styles[status] || styles.draft}`}>
      {labels[status] || status}
    </span>
  )
}

const StudentClassForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const { isSuperadmin } = useAuth()
  const isEditMode = Boolean(id)

  const [loading, setLoading] = useState(isEditMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [classRecord, setClassRecord] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // Quest picker
  const [questSearch, setQuestSearch] = useState('')
  const [questResults, setQuestResults] = useState([])
  const [classQuests, setClassQuests] = useState([])

  // Invites
  const [invites, setInvites] = useState([])
  const [copiedToken, setCopiedToken] = useState(null)

  // Kickoff attendance
  const [roster, setRoster] = useState([])
  const [rosterLoaded, setRosterLoaded] = useState(false)

  // Cover image
  const [coverBusy, setCoverBusy] = useState(false)
  const fileInputRef = React.useRef(null)

  // Create-quest modal
  const [showCreateQuestModal, setShowCreateQuestModal] = useState(false)

  const loadClass = async (classId) => {
    setLoading(true)
    setError(null)
    try {
      const [classResp, questsResp, invitesResp] = await Promise.all([
        getClass(classId),
        getClassQuests(classId),
        listInvites(classId).catch(() => ({ invites: [] })),
      ])
      const c = classResp.course
      setClassRecord(c)
      setForm({
        title: c.title || '',
        description: c.description || '',
        kickoff_at: toDatetimeLocal(c.kickoff_at),
        kickoff_meeting_url: c.kickoff_meeting_url || '',
        credit_subject: c.credit_subject || '',
        credit_amount: c.credit_amount ?? 0.5,
        max_cohort_size: c.max_cohort_size ?? '',
      })
      setClassQuests(questsResp.quests || questsResp.data || [])
      setInvites(invitesResp.invites || [])
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isEditMode) loadClass(id)
  }, [id, isEditMode])

  const handleField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const formWithIso = { ...form, kickoff_at: fromDatetimeLocal(form.kickoff_at) }
      if (isEditMode) {
        const payload = buildUpdatePayload(formWithIso)
        await updateClass(id, payload)
        await loadClass(id)
      } else {
        const resp = await createClass(formWithIso)
        const newId = resp.course?.id
        if (newId) navigate(`/classes/${newId}/edit`)
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitForReview = async () => {
    if (!classQuests.length) {
      setError('Add at least one quest before submitting for review.')
      return
    }
    if (!form.kickoff_at) {
      setError('Pick a kickoff date and time before submitting for review.')
      return
    }
    if (!form.credit_subject || !form.credit_amount) {
      setError('Choose a credit subject and amount before submitting for review.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const formWithIso = { ...form, kickoff_at: fromDatetimeLocal(form.kickoff_at) }
      const payload = buildUpdatePayload(formWithIso)
      await updateClass(id, payload)
      await submitForReview(id)
      await loadClass(id)
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAdminPublish = async () => {
    if (!isSuperadmin) return
    setSaving(true)
    setError(null)
    try {
      // Save any pending edits, then flip to published
      const formWithIso = { ...form, kickoff_at: fromDatetimeLocal(form.kickoff_at) }
      const payload = buildUpdatePayload(formWithIso)
      await updateClass(id, payload)
      await publishClass(id)
      await loadClass(id)
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReturnToDraft = async () => {
    setSaving(true)
    setError(null)
    try {
      await returnToDraft(id)
      await loadClass(id)
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- Quest picker ----
  const runQuestSearch = async (q) => {
    if (!q || q.length < 2) {
      setQuestResults([])
      return
    }
    try {
      const results = await searchQuests(q, 15)
      setQuestResults(results)
    } catch (e) {
      // ignore search errors to keep typing responsive
    }
  }

  useEffect(() => {
    const t = setTimeout(() => runQuestSearch(questSearch), 250)
    return () => clearTimeout(t)
  }, [questSearch])

  const existingQuestIds = useMemo(
    () => new Set(classQuests.map((q) => q.id || q.quest_id)),
    [classQuests]
  )

  const handleAddQuest = async (questId) => {
    try {
      await addQuestToClass(id, questId)
      const { quests } = await getClassQuests(id)
      setClassQuests(quests || [])
      setQuestSearch('')
      setQuestResults([])
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  const handleRemoveQuest = async (questId) => {
    try {
      await removeQuestFromClass(id, questId)
      const { quests } = await getClassQuests(id)
      setClassQuests(quests || [])
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  const handleQuestCreated = async (newQuest) => {
    // CreateQuestModal returns the newly-created quest; auto-add it to the class
    if (!newQuest?.id) return
    try {
      await addQuestToClass(id, newQuest.id)
      const { quests } = await getClassQuests(id)
      setClassQuests(quests || [])
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  // ---- Invites ----
  const handleCreateInvite = async () => {
    try {
      const resp = await createInvite(id, {})
      setInvites((prev) => [resp.invite, ...prev])
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  const handleRevokeInvite = async (inviteId) => {
    try {
      await revokeInvite(inviteId)
      const resp = await listInvites(id)
      setInvites(resp.invites || [])
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  const copyToClipboard = (token) => {
    const url = buildInviteUrl(token, classRecord?.slug)
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  // ---- Kickoff roster ----
  const loadRoster = async () => {
    if (!isEditMode) return
    try {
      const resp = await getKickoffAttendance(id)
      setRoster(resp.roster || [])
      setRosterLoaded(true)
    } catch (e) {
      // silent — user may not have permission
    }
  }

  useEffect(() => {
    if (isEditMode && classRecord?.status === 'published' && isSuperadmin) {
      loadRoster()
    }
  }, [isEditMode, classRecord?.status, isSuperadmin, id])

  const handleToggleAttendance = async (enrollmentId, current) => {
    try {
      await markKickoffAttended(id, enrollmentId, !current)
      await loadRoster()
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }

  // ---- Cover image ----
  const handleGenerateCover = async () => {
    if (!isEditMode) return
    setCoverBusy(true)
    setError(null)
    try {
      const resp = await generateCoverImage(id)
      if (resp.url) {
        setClassRecord((c) => ({ ...(c || {}), cover_image_url: resp.url }))
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    } finally {
      setCoverBusy(false)
    }
  }

  const handleUploadCover = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !isEditMode) return
    setCoverBusy(true)
    setError(null)
    try {
      const resp = await uploadCoverImage(id, file)
      if (resp.url) {
        setClassRecord((c) => ({ ...(c || {}), cover_image_url: resp.url }))
      }
    } catch (e2) {
      setError(e2?.response?.data?.error || e2.message)
    } finally {
      setCoverBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" />
      </div>
    )
  }

  const status = classRecord?.status || 'draft'
  const editable = status === 'draft' || status === 'pending_review'
  const canSubmitForReview = isEditMode && status === 'draft'
  const canReturnToDraft = isEditMode && status === 'pending_review'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditMode ? 'Edit your class' : 'Create a class'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Design a learning experience you and your friends can do together.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isEditMode && classRecord?.slug && (
            <a
              href={`/class/${classRecord.slug}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm border border-optio-purple text-optio-purple rounded-lg font-medium hover:bg-optio-purple/5"
            >
              Preview class page
            </a>
          )}
          {isEditMode && <StatusBadge status={status} />}
        </div>
      </div>

      {status === 'pending_review' && (
        <div className="mb-6 p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-900">
          Your class is with an Optio teacher for review. You'll hear back within 2 business days.
          While it's under review you can return it to draft to keep editing.
        </div>
      )}
      {status === 'published' && (
        <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-900">
          Your class is live. Share your invite link below to get friends to join.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Basics */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Basics</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class title</label>
            <input
              type="text"
              value={form.title}
              onChange={handleField('title')}
              disabled={!editable}
              maxLength={120}
              placeholder="e.g. Real-World Science Semester"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What is this class about?
            </label>
            <textarea
              value={form.description}
              onChange={handleField('description')}
              disabled={!editable}
              rows={4}
              maxLength={2000}
              placeholder="Tell your friends (and their parents) what you'll do together, where you'll meet, and what they'll get out of it."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple disabled:bg-gray-50"
            />
          </div>
        </div>
      </section>

      {/* Cover image (edit-mode only, since upload targets a saved class) */}
      {isEditMode && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Cover image</h2>
          <p className="text-sm text-gray-500 mb-3">
            Shown at the top of your class page. Generate one automatically from your title, or upload your own.
          </p>
          <div className="flex items-start gap-4">
            <div className="w-48 h-32 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
              {classRecord?.cover_image_url ? (
                <img
                  src={classRecord.cover_image_url}
                  alt="Class cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                  No image yet
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleGenerateCover}
                disabled={coverBusy || !editable || !form.title}
                className="px-3 py-2 text-sm bg-optio-purple text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {coverBusy ? 'Working...' : 'Generate from title'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={coverBusy || !editable}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Upload your own
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadCover}
                className="hidden"
              />
            </div>
          </div>
        </section>
      )}

      {/* Kickoff */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Kickoff call</h2>
        <p className="text-sm text-gray-500 mb-3">
          Required. Every student and their parent has to attend the kickoff video call before the class starts.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kickoff date and time</label>
            <input
              type="datetime-local"
              value={form.kickoff_at}
              onChange={handleField('kickoff_at')}
              disabled={!editable}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Meeting link (optional; an admin can fill this in)
            </label>
            <input
              type="url"
              value={form.kickoff_meeting_url}
              onChange={handleField('kickoff_meeting_url')}
              disabled={!editable}
              placeholder="https://meet.google.com/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple disabled:bg-gray-50"
            />
          </div>
        </div>
      </section>

      {/* Credit target */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Credit</h2>
        <p className="text-sm text-gray-500 mb-3">
          What kind of credit should students who complete the class earn?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select
              value={form.credit_subject}
              onChange={handleField('credit_subject')}
              disabled={!editable}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple disabled:bg-gray-50"
            >
              <option value="">Choose a subject</option>
              {CREDIT_SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <select
              value={form.credit_amount}
              onChange={handleField('credit_amount')}
              disabled={!editable}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple disabled:bg-gray-50"
            >
              {CREDIT_AMOUNTS.map((a) => (
                <option key={a} value={a}>{a.toFixed(2)} credits</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max students (optional)</label>
            <input
              type="number"
              min="1"
              value={form.max_cohort_size}
              onChange={handleField('max_cohort_size')}
              disabled={!editable}
              placeholder="No limit"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple disabled:bg-gray-50"
            />
          </div>
        </div>
      </section>

      {/* Quests (edit-mode only, since we need a saved class to attach them to) */}
      {isEditMode && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Activities (quests)</h2>
          <p className="text-sm text-gray-500 mb-3">
            Add each activity your group will do together. Every student will complete the quests on their own account during the class.
          </p>

          <div className="mb-3">
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={questSearch}
                onChange={(e) => setQuestSearch(e.target.value)}
                disabled={!editable}
                placeholder="Search Optio quests to add..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple disabled:bg-gray-50"
              />
              <button
                type="button"
                onClick={() => setShowCreateQuestModal(true)}
                disabled={!editable}
                className="px-3 py-2 text-sm whitespace-nowrap border border-optio-purple text-optio-purple rounded-lg font-medium hover:bg-optio-purple/5 disabled:opacity-50"
              >
                Create your own
              </button>
            </div>
            {questResults.length > 0 && editable && (
              <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-sm max-h-64 overflow-y-auto">
                {questResults.map((q) => {
                  const already = existingQuestIds.has(q.id)
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => !already && handleAddQuest(q.id)}
                      disabled={already}
                      className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 ${already ? 'text-gray-400 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                    >
                      <div className="font-medium text-sm">{q.title}</div>
                      {q.description && (
                        <div className="text-xs text-gray-500 line-clamp-1">{q.description}</div>
                      )}
                      {already && <div className="text-xs text-gray-400 mt-0.5">Already added</div>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {classQuests.length === 0 ? (
            <div className="p-4 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 text-center">
              No activities added yet. Search above to add some.
            </div>
          ) : (
            <ol className="space-y-2">
              {classQuests.map((q, idx) => (
                <li
                  key={q.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono text-sm w-6">{idx + 1}.</span>
                    <span className="font-medium text-gray-900">{q.title}</span>
                  </div>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => handleRemoveQuest(q.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* Invite links (only useful once the class is published) */}
      {isEditMode && status === 'published' && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Invite your friends</h2>
          <p className="text-sm text-gray-500 mb-3">
            Share this link. Anyone you send it to will land on your class page and can sign up from there.
          </p>
          <button
            type="button"
            onClick={handleCreateInvite}
            className="mb-3 px-4 py-2 bg-optio-purple text-white rounded-lg font-medium hover:opacity-90"
          >
            Generate a new invite link
          </button>

          {invites.length === 0 ? (
            <div className="text-sm text-gray-500">No invite links yet.</div>
          ) : (
            <ul className="space-y-2">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className={`p-3 border rounded-lg ${inv.is_active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 font-mono text-xs text-gray-700 truncate">
                      {buildInviteUrl(inv.token, classRecord?.slug)}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {inv.is_active ? (
                        <>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(inv.token)}
                            className="px-3 py-1 text-xs rounded bg-optio-purple text-white font-medium hover:opacity-90"
                          >
                            {copiedToken === inv.token ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="px-3 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50"
                          >
                            Revoke
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">Revoked</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {inv.uses_count} sign-up{inv.uses_count === 1 ? '' : 's'}
                    {inv.max_uses ? ` of ${inv.max_uses} allowed` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Kickoff roster (admin-only, published classes) */}
      {isEditMode && isSuperadmin && status === 'published' && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Kickoff attendance</h2>
          <p className="text-sm text-gray-500 mb-3">
            Mark each student as attended after the kickoff video call. Attendance is required to complete the class.
          </p>
          {!rosterLoaded ? (
            <div className="text-sm text-gray-500">Loading roster...</div>
          ) : roster.length === 0 ? (
            <div className="p-4 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 text-center">
              No students enrolled yet.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg bg-white">
              {roster.map((r) => (
                <li key={r.enrollment_id} className="p-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{r.student_name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {r.student_email}
                      {r.parent_email && <span> &middot; parent: {r.parent_email}</span>}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer flex-shrink-0 ml-3">
                    <input
                      type="checkbox"
                      checked={!!r.kickoff_attended}
                      onChange={() => handleToggleAttendance(r.enrollment_id, r.kickoff_attended)}
                      className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                    />
                    <span className="text-sm text-gray-700">Attended</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Footer actions */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-4 px-4 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/my-classes')}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to my classes
        </button>
        <div className="flex items-center gap-2">
          {editable && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.title}
              className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditMode ? 'Save draft' : 'Create class'}
            </button>
          )}
          {canSubmitForReview && (
            <button
              type="button"
              onClick={handleSubmitForReview}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              Submit for review
            </button>
          )}
          {canReturnToDraft && (
            <button
              type="button"
              onClick={handleReturnToDraft}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Return to draft
            </button>
          )}
          {isSuperadmin && isEditMode && status === 'pending_review' && (
            <button
              type="button"
              onClick={handleAdminPublish}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Publish class
            </button>
          )}
        </div>
      </div>

      <CreateQuestModal
        isOpen={showCreateQuestModal}
        onClose={() => setShowCreateQuestModal(false)}
        onSuccess={handleQuestCreated}
      />
    </div>
  )
}

export default StudentClassForm
