import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { DocumentTextIcon, LinkIcon, PencilSquareIcon, PlayCircleIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

/**
 * Attaching files, links and videos to a quest and to its individual tasks.
 *
 * A quest had one `material_link` and a task had nothing, so a teacher with a
 * worksheet for step 3 and a demo video for step 5 pasted both into a
 * description or dropped them on the class, where they sit in one list with no
 * way to say which task they are for (iCreate, 2026-09-10).
 *
 * Pass `taskId` to manage one task's attachments, or omit it for the quest's
 * own. The two are the same UI because they are the same thing at different
 * scopes; what changes is which list the API writes to.
 *
 * A quest that has not been saved yet has no id to attach to, so the caller
 * renders the "save first" line rather than a control that would 404.
 */

const KIND_ICON = { file: DocumentTextIcon, video: PlayCircleIcon, link: LinkIcon }

const QuestResourcesPanel = ({ questId, taskId = null, compact = false }) => {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  // The row being corrected, if any: {id, title, url}. A typo in a name or a
  // pasted-wrong link meant deleting the attachment and starting over, and on
  // an uploaded file that meant uploading the file again (iCreate, 2026-09-22).
  const [editing, setEditing] = useState(null)

  const load = useCallback(() => {
    if (!questId) return
    setLoading(true)
    api.get(`/api/sis/quests/${questId}/resources`)
      .then((r) => {
        const data = r.data || {}
        const rows = taskId ? data.by_task?.[taskId] : data.quest
        // A response of another shape (a proxy error page, a stale mock) must
        // render as an empty list, not take the whole form down with it.
        setResources(Array.isArray(rows) ? rows : [])
      })
      .catch(() => toast.error('Could not load the resources'))
      .finally(() => setLoading(false))
  }, [questId, taskId])

  useEffect(() => { load() }, [load])

  const addLink = async () => {
    if (!url.trim()) { toast.error('Paste a link first'); return }
    setBusy(true)
    try {
      // The server decides link vs video by matching the URL, but saying which
      // one was meant lets it store the intent rather than guess it.
      const looksLikeVideo = /youtube\.com|youtu\.be|vimeo\.com|loom\.com|drive\.google\.com/
        .test(url)
      await api.post(`/api/sis/quests/${questId}/resources`, {
        task_id: taskId || undefined,
        kind: looksLikeVideo ? 'video' : 'link',
        title: title.trim(),
        url: url.trim(),
      })
      setUrl(''); setTitle(''); setAdding(false)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not attach that')
    } finally { setBusy(false) }
  }

  const upload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (taskId) form.append('task_id', taskId)
      if (title.trim()) form.append('title', title.trim())
      await api.post(`/api/sis/quests/${questId}/resources/upload`, form)
      setTitle(''); setAdding(false)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not upload that file')
    } finally { setBusy(false) }
  }

  const saveEdit = async () => {
    const next = { title: (editing.title || '').trim() }
    // A file's URL is a signed storage path, so only a link's is offered.
    // The server refuses a URL on a file either way.
    if (editing.kind !== 'file') next.url = (editing.url || '').trim()
    if (!next.title) { toast.error('Give it a name'); return }
    setBusy(true)
    try {
      await api.patch(`/api/sis/quests/${questId}/resources/${editing.id}`, next)
      setEditing(null)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save that')
    } finally { setBusy(false) }
  }

  const remove = async (resource) => {
    try {
      await api.delete(`/api/sis/quests/${questId}/resources/${resource.id}`)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not remove that')
    }
  }

  if (!questId) {
    return <p className="text-xs text-neutral-500">Save the quest to attach resources.</p>
  }

  return (
    <div className={compact ? 'mt-2' : 'mt-4'}>
      {!compact && (
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
          Resources
        </p>
      )}

      {loading ? (
        <p className="text-xs text-neutral-500">Loading…</p>
      ) : (
        <ul className="space-y-1.5">
          {resources.map((r) => {
            const Icon = KIND_ICON[r.kind] || LinkIcon
            if (editing?.id === r.id) {
              return (
                <li key={r.id} className="rounded-lg border border-optio-purple/40 p-2.5 space-y-2">
                  <input value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    aria-label="Name" placeholder="Name"
                    className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
                  {r.kind === 'file' ? (
                    <p className="text-xs text-neutral-500">
                      Uploaded file. To change the file itself, remove this and upload the new one.
                    </p>
                  ) : (
                    <input value={editing.url}
                      onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                      aria-label="Link" placeholder="https://…"
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple" />
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={saveEdit} disabled={busy}
                      className="rounded-lg bg-optio-purple px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditing(null)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-neutral-600">
                      Cancel
                    </button>
                  </div>
                </li>
              )
            }
            return (
              <li key={r.id}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
                <Icon className="w-4 h-4 text-optio-purple flex-shrink-0" />
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 min-w-0 text-sm text-neutral-800 truncate hover:underline">
                  {r.title}
                </a>
                <button type="button"
                  onClick={() => setEditing({ id: r.id, title: r.title || '', url: r.url || '', kind: r.kind })}
                  aria-label={`Edit ${r.title}`}
                  className="text-neutral-400 hover:text-optio-purple">
                  <PencilSquareIcon className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => remove(r)}
                  aria-label={`Remove ${r.title}`}
                  className="text-neutral-400 hover:text-optio-pink">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {adding ? (
        <div className="mt-2 space-y-2 rounded-lg border border-gray-200 p-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="What is it called? (optional)" aria-label="Resource title"
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm" />
          <div className="flex flex-wrap gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a link or video URL" aria-label="Resource URL"
              className="flex-1 min-w-[180px] px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm" />
            <button type="button" onClick={addLink} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
              Attach
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-optio-purple hover:underline cursor-pointer">
              or upload a file
              <input type="file" onChange={upload} disabled={busy} className="hidden" />
            </label>
            <button type="button" onClick={() => { setAdding(false); setUrl(''); setTitle('') }}
              className="text-xs text-neutral-500 hover:underline">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="mt-2 text-sm font-medium text-optio-purple hover:underline">
          + Add a resource
        </button>
      )}
    </div>
  )
}

export default QuestResourcesPanel
