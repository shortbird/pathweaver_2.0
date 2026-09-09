import React, { useCallback, useEffect, useRef, useState } from 'react'
import api from '../../services/api'

/**
 * Student mode on the kiosk: after the passwordless login, greet the student,
 * let them pick one of their quests -> a task, photograph their paper work
 * (multi-shot camera input with thumbnails), and turn it in as evidence
 * through the standard evidence-document endpoints. Ends on a success screen
 * that auto signs the student out (via onFinished from the parent page).
 *
 * Two things a five-year-old at a shared iPad cannot do any other way
 * (2026-09-07, Arete's Explorers):
 *
 *  - Start a quest their teacher assigned to their class. Assigning creates
 *    no enrollment; the student has to press Start from their own login, and
 *    these students never log in anywhere. So the first screen also lists
 *    the class assignments under "Assigned to you", and a tap enrolls with
 *    the same call the web app's Start button makes. A quest with teacher
 *    tasks copies them on enrollment, so the task list is there at once.
 *
 *  - Add a task of their own. The quest may list nothing that matches what
 *    they just did, or nothing at all, so the task screen ends with "I did
 *    something else": one question, "What did you do?", then straight to the
 *    camera. It is the web app's manual-task path with no pillar or XP asked
 *    (the server picks a pillar and applies the school's XP policy), and the
 *    task is approved on the spot, like every student-made task.
 *
 * Defensive by design: every network step surfaces a friendly retryable error
 * instead of throwing, because this runs unattended on a shared iPad.
 */

const btnPrimary =
  'rounded-xl py-3 px-6 text-white font-semibold bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50 touch-manipulation'

const Header = ({ title, subtitle, onBack, onSignOut }) => (
  <div className="flex items-start justify-between gap-3 mb-6">
    <div className="flex items-center gap-3">
      {onBack && (
        <button onClick={onBack} aria-label="Back" className="p-2 rounded-full bg-white shadow-sm">
          <svg className="w-6 h-6 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">{title}</h1>
        {subtitle && <p className="text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <button onClick={onSignOut} className="text-sm text-neutral-400 underline whitespace-nowrap pt-2">
      I'm done
    </button>
  </div>
)

/** The dashboard payload -> the two lists the kiosk offers. */
function shapeDashboard(data) {
  const active = (data?.active_quests || [])
    .map((enrollment) => {
      const q = enrollment.quests || {}
      const tasks = (q.quest_tasks || []).filter((t) => t && t.id)
      return {
        quest_id: enrollment.quest_id || q.id,
        title: q.title || 'Quest',
        image_url: q.image_url,
        tasks,
        openTasks: tasks.filter((t) => !t.is_completed),
      }
    })
    .filter((q) => q.quest_id)
  const activeIds = new Set(active.map((q) => q.quest_id))
  const assigned = (data?.assigned_class_quests || [])
    .map((a) => ({
      quest_id: a.quest?.id,
      title: a.quest?.title || 'Quest',
      class_name: a.class_name,
    }))
    .filter((a) => a.quest_id && !activeIds.has(a.quest_id))
  return { active, assigned }
}

export default function KioskStudentSession({ studentName, accentColor, onFinished }) {
  // step: loading | quests | tasks | newTask | capture | uploading | done | error
  const [step, setStep] = useState('loading')
  const [quests, setQuests] = useState([])
  const [assigned, setAssigned] = useState([])
  const [quest, setQuest] = useState(null)
  const [task, setTask] = useState(null)
  const [photos, setPhotos] = useState([]) // [{ file, previewUrl }]
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const doneTimer = useRef(null)

  // The student's quests (started + assigned) via the standard dashboard API.
  const loadDashboard = useCallback(async () => {
    const { data } = await api.get('/api/users/dashboard')
    const shaped = shapeDashboard(data)
    setQuests(shaped.active)
    setAssigned(shaped.assigned)
    return shaped
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadDashboard()
        if (!cancelled) setStep('quests')
      } catch (e) {
        if (!cancelled) {
          setError('Could not load your quests.')
          setStep('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [loadDashboard])

  useEffect(() => () => {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    if (doneTimer.current) clearTimeout(doneTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A tap on an assigned quest starts it for this student, then opens its
  // task list (the teacher's tasks, copied on enrollment).
  const startAssigned = async (a) => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/api/quests/${a.quest_id}/enroll`, {})
      const shaped = await loadDashboard()
      const started = shaped.active.find((q) => q.quest_id === a.quest_id)
      setQuest(started || { quest_id: a.quest_id, title: a.title, tasks: [], openTasks: [] })
      setStep('tasks')
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not start that quest. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // "I did something else": one title, server-picked pillar and XP, approved
  // immediately, then straight to the camera for that task.
  const createTask = async () => {
    const title = newTaskTitle.trim()
    if (!title || !quest) return
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post(`/api/quests/${quest.quest_id}/add-manual-tasks`, {
        tasks: [{ title }],
      })
      const created = data?.tasks?.[0]
      if (!data?.success || !created?.id) throw new Error(data?.error || 'Could not add that task')
      const added = { ...created, is_completed: false }
      setQuest((q) => (q ? { ...q, tasks: [...q.tasks, added], openTasks: [...q.openTasks, added] } : q))
      setTask(added)
      setNewTaskTitle('')
      setStep('capture')
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not add that task. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const addPhotos = (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setPhotos((prev) => [
      ...prev,
      ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ])
  }

  const removePhoto = (i) => {
    setPhotos((prev) => {
      const removed = prev[i]
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, j) => j !== i)
    })
  }

  const submit = async () => {
    if (!task || photos.length === 0) return
    setStep('uploading')
    setError('')
    try {
      // 1. Upload each photo through the standard task-evidence upload endpoint.
      const uploaded = []
      for (const p of photos) {
        const form = new FormData()
        form.append('file', p.file)
        form.append('block_type', 'image')
        const { data } = await api.post(`/api/evidence/documents/${task.id}/upload`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        if (!data?.url) throw new Error(data?.error || 'Upload failed')
        uploaded.push({ url: data.url, filename: data.filename || p.file.name })
      }

      // 2. Merge with any existing evidence blocks so nothing is clobbered.
      let existingBlocks = []
      try {
        const { data } = await api.get(`/api/evidence/documents/${task.id}`)
        existingBlocks = (data?.blocks || []).map((b) => ({
          id: b.id,
          type: b.block_type,
          content: b.content || {},
          is_private: b.is_private || false,
        }))
      } catch {
        existingBlocks = [] // no existing document is fine
      }

      const newBlocks = uploaded.map((u) => ({
        type: 'image',
        content: { url: u.url, filename: u.filename, caption: 'Scanned at the kiosk' },
      }))

      // 3. Save the evidence document as completed (standard flow: awards XP).
      const { data: saved } = await api.post(`/api/evidence/documents/${task.id}`, {
        blocks: [...existingBlocks, ...newBlocks],
        status: 'completed',
      })
      if (!saved?.success) throw new Error(saved?.error || 'Save failed')

      setStep('done')
      // Auto sign-out back to the name grid after a short celebration.
      doneTimer.current = setTimeout(() => onFinished(), 6000)
    } catch (e) {
      setError(e?.response?.data?.error || 'Something went wrong saving your work. Try again.')
      setStep('capture')
    }
  }

  const accent = accentColor || undefined

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center font-poppins bg-gradient-to-br from-optio-purple/10 to-optio-pink/10">
        <p className="text-xl font-semibold text-neutral-500">Loading your quests...</p>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 font-poppins bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 p-6">
        <p className="text-xl font-semibold text-neutral-700">{error || 'Something went wrong.'}</p>
        <button onClick={onFinished} className={btnPrimary}>Back to names</button>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 font-poppins bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 p-6">
        <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center">
          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-neutral-900" style={accent ? { color: accent } : undefined}>
          Nice work, {studentName}!
        </h1>
        <p className="text-neutral-500">Your work was turned in.</p>
        <button onClick={onFinished} className={btnPrimary}>Done</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 font-poppins p-6">
      <div className="max-w-3xl mx-auto">
        {step === 'quests' && (
          <>
            <Header title={`Hi, ${studentName}!`} subtitle="Which quest is this work for?" onSignOut={onFinished} />
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 mb-4">{error}</div>
            )}
            {quests.length === 0 && assigned.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <p className="text-neutral-600 font-semibold">You don't have any quests yet.</p>
                <p className="text-neutral-400 text-sm mt-1">Ask your teacher to assign one to your class.</p>
              </div>
            ) : (
              <>
                {quests.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {quests.map((q) => (
                      <button
                        key={q.quest_id}
                        onClick={() => { setQuest(q); setError(''); setStep('tasks') }}
                        className="bg-white rounded-2xl p-5 text-left shadow-sm hover:shadow-md active:scale-[0.98] transition touch-manipulation"
                      >
                        <p className="text-lg font-bold text-neutral-900">{q.title}</p>
                        <p className="text-sm text-neutral-400 mt-1">
                          {q.openTasks.length} task{q.openTasks.length === 1 ? '' : 's'} to do
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {assigned.length > 0 && (
                  <div className={quests.length > 0 ? 'mt-8' : ''}>
                    <h2 className="text-lg font-bold text-neutral-700 mb-3">Assigned to you</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {assigned.map((a) => (
                        <button
                          key={a.quest_id}
                          disabled={busy}
                          onClick={() => startAssigned(a)}
                          className="bg-white rounded-2xl p-5 text-left shadow-sm hover:shadow-md active:scale-[0.98] transition disabled:opacity-50 touch-manipulation border-2 border-dashed border-neutral-200"
                        >
                          <p className="text-lg font-bold text-neutral-900">{a.title}</p>
                          <p className="text-sm text-neutral-400 mt-1">
                            {a.class_name ? `From ${a.class_name} · ` : ''}{busy ? 'Starting...' : 'Tap to start'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {step === 'tasks' && quest && (
          <>
            <Header
              title={quest.title}
              subtitle="Which task did you work on?"
              onBack={() => { setQuest(null); setError(''); setStep('quests') }}
              onSignOut={onFinished}
            />
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 mb-4">{error}</div>
            )}
            <div className="space-y-3">
              {quest.tasks.map((t) => (
                <button
                  key={t.id}
                  disabled={t.is_completed}
                  onClick={() => { setTask(t); setStep('capture') }}
                  className="w-full bg-white rounded-2xl p-4 flex items-center justify-between gap-3 text-left shadow-sm hover:shadow-md active:scale-[0.99] transition disabled:opacity-50 touch-manipulation"
                >
                  <div>
                    <p className="font-semibold text-neutral-900">{t.title}</p>
                    {t.is_completed && <p className="text-sm text-green-600">Already turned in</p>}
                  </div>
                  <span className="text-sm font-bold text-neutral-400 whitespace-nowrap">{t.xp_value} XP</span>
                </button>
              ))}
              <button
                onClick={() => { setNewTaskTitle(''); setError(''); setStep('newTask') }}
                className="w-full rounded-2xl p-4 flex items-center gap-3 text-left border-2 border-dashed border-neutral-300 text-neutral-600 hover:border-optio-purple hover:text-optio-purple touch-manipulation"
              >
                <span className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center text-2xl font-bold leading-none">+</span>
                <span className="font-semibold">I did something else</span>
              </button>
            </div>
          </>
        )}

        {step === 'newTask' && quest && (
          <>
            <Header
              title="What did you do?"
              subtitle={quest.title}
              onBack={() => { setError(''); setStep('tasks') }}
              onSignOut={onFinished}
            />
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 mb-4">{error}</div>
            )}
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createTask() }}
              placeholder="I built a bird feeder"
              aria-label="What did you do?"
              autoFocus
              autoComplete="off"
              maxLength={120}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-xl focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
            <div className="mt-6">
              <button
                onClick={createTask}
                disabled={busy || !newTaskTitle.trim()}
                className={`w-full ${btnPrimary}`}
                style={accent ? { background: accent } : undefined}
              >
                {busy ? 'Saving...' : 'Next: take a photo'}
              </button>
            </div>
          </>
        )}

        {(step === 'capture' || step === 'uploading') && task && (
          <>
            <Header
              title={task.title}
              subtitle="Take a photo of your work"
              onBack={step === 'capture' ? () => { setTask(null); setError(''); setStep('tasks') } : undefined}
              onSignOut={onFinished}
            />
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 mb-4">{error}</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              aria-label="Take a photo"
              onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }}
            />
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {photos.map((p, i) => (
                <div key={p.previewUrl} className="relative">
                  <img src={p.previewUrl} alt={`Photo ${i + 1}`} className="w-full aspect-square object-cover rounded-xl" />
                  {step === 'capture' && (
                    <button
                      onClick={() => removePhoto(i)}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-rose-600 text-white font-bold shadow"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
              {step === 'capture' && (
                <button
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center text-neutral-400 hover:border-optio-purple hover:text-optio-purple touch-manipulation"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-semibold mt-1">{photos.length ? 'Add another' : 'Take photo'}</span>
                </button>
              )}
            </div>
            <div className="mt-8">
              <button
                onClick={submit}
                disabled={photos.length === 0 || step === 'uploading'}
                className={`w-full ${btnPrimary}`}
                style={accent ? { background: accent } : undefined}
              >
                {step === 'uploading'
                  ? 'Turning in your work...'
                  : `Turn in ${photos.length || ''} photo${photos.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
