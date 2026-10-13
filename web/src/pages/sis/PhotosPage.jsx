import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../../components/ui/Button'
import { INPUT_CLASS } from '../../components/ui/Input'
import { useSisOrg } from './useSisOrg'
import { useSavePhotos, useSisPhotos } from '../../hooks/api/useSisPhotos'

/**
 * Photos -- a coach takes or uploads a picture, taps every student in it, and
 * saves (ticket 85949de5, Apogee Cache Valley). The photo goes into each
 * tagged student's journal and their parents get a note; the server does all
 * of that (routes/sis/photos.py -> services/group_photo_service.py, the code
 * Treehouse's Capture tab runs too). Nothing here decides who is notified.
 */

// The coach's own calendar day, which is what "today" means on a photo.
export const localToday = () => new Date().toLocaleDateString('en-CA')

const fmtDay = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
  month: 'short', day: 'numeric', year: 'numeric',
}) : '')

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const previewUrl = (file) => {
  try {
    return typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : null
  } catch {
    return null
  }
}

const release = (list) => list.forEach((f) => {
  try { if (f.url) URL.revokeObjectURL(f.url) } catch { /* no object URLs here (jsdom) */ }
})

const StudentChip = ({ student, on, onToggle }) => (
  <button type="button" onClick={() => onToggle(student.id)} aria-pressed={on}
    className={`rounded-full border px-3 py-2 text-sm font-medium transition-all duration-200 min-h-[40px] ${
      on ? 'border-optio-purple bg-optio-purple/10 text-optio-purple'
        : 'border-gray-200 bg-white text-gray-700 hover:border-optio-purple/60'}`}>
    {on && <span aria-hidden="true" className="mr-1">&#10003;</span>}
    {student.name}
  </button>
)

const RecentCapture = ({ capture }) => {
  const first = (capture.media || []).find((m) => m.url)
  return (
    <li className="flex gap-3 p-4">
      {first ? (
        first.type === 'video'
          ? <video src={first.url} className="h-16 w-16 shrink-0 rounded-lg object-cover bg-gray-100" muted />
          : <img src={first.url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover bg-gray-100" />
      ) : (
        <span className="h-16 w-16 shrink-0 rounded-lg bg-optio-purple/10" aria-hidden="true" />
      )}
      <div className="min-w-0">
        {capture.caption && <p className="text-sm text-gray-900 break-words">{capture.caption}</p>}
        <p className="text-sm text-gray-600 mt-0.5">
          {(capture.students || []).map((s) => s.name).join(', ')}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {capture.captured_by_name} · {fmtDay(capture.event_date)}
          {(capture.media || []).length > 1 ? ` · ${capture.media.length} files` : ''}
        </p>
      </div>
    </li>
  )
}

const PhotosPage = () => {
  const { orgId } = useSisOrg()
  const photos = useSisPhotos(orgId)
  const save = useSavePhotos(orgId)
  const [files, setFiles] = useState([])            // [{file, url}]
  const [tagged, setTagged] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [caption, setCaption] = useState('')
  const [eventDate, setEventDate] = useState(localToday)
  const [done, setDone] = useState(null)
  const cameraRef = useRef(null)
  const uploadRef = useRef(null)

  const data = photos.isError ? { students: [], recent: [] } : (photos.data || null)

  // Free each preview URL when its file leaves the form, and the rest when
  // the page closes.
  const filesRef = useRef(files)
  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => () => release(filesRef.current), [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.students || []).filter((s) => !q || (s.name || '').toLowerCase().includes(q))
  }, [data, search])

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    setFiles((prev) => [...prev, ...picked.map((file) => ({ file, url: previewUrl(file) }))].slice(0, 10))
  }

  const toggle = (id) => {
    setTagged((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    // The next student you want is almost never the one you just typed.
    if (!tagged.has(id)) setSearch('')
  }

  const reset = () => {
    release(files)
    setFiles([]); setTagged(new Set()); setCaption(''); setSearch(''); setEventDate(localToday())
  }

  const submit = async () => {
    if (tagged.size === 0) return toast.error('Tap at least one student')
    if (files.length === 0 && !caption.trim()) return toast.error('Add a photo or a caption')
    try {
      const out = await save.mutateAsync({
        files: files.map((f) => f.file), studentIds: [...tagged],
        caption: caption.trim(), eventDate,
      })
      setDone(out)
      reset()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the photo')
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Photos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Take or upload a photo, tap every student in it, and save. It goes into each
          student&apos;s journal, and their parents get a note.
        </p>
      </div>

      {done && (
        <div role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">
            Saved to {plural(done.count, 'journal', 'journals')}.
          </p>
          <p className="mt-0.5">
            {done.families_notified
              ? `${plural(done.families_notified, 'family', 'families')} notified.`
              : 'No parents are linked to these students yet, so nobody was notified.'}
          </p>
          <Button variant="secondary" size="xs" className="mt-3" onClick={() => setDone(null)}>
            Take another
          </Button>
        </div>
      )}

      {data === null && <p className="text-gray-500">Loading…</p>}

      {data && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 space-y-5">
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Photo</h2>
            <div className="flex flex-wrap gap-2">
              {/* capture="environment" opens the back camera on phones and tablets. */}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={addFiles} aria-label="Take a photo" data-testid="camera-input" />
              <input ref={uploadRef} type="file" accept="image/*,video/*" multiple className="hidden"
                onChange={addFiles} aria-label="Upload photos" data-testid="upload-input" />
              <Button size="sm" variant="secondary" onClick={() => cameraRef.current?.click()}>Take a photo</Button>
              <Button size="sm" variant="secondary" onClick={() => uploadRef.current?.click()}>Upload photos</Button>
            </div>
            {files.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li key={`${f.file.name}-${i}`} className="relative">
                    {f.url && (f.file.type || '').startsWith('image')
                      ? <img src={f.url} alt={f.file.name} className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
                      : <span className="flex h-20 w-20 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs text-gray-600 break-all">{f.file.name}</span>}
                    <button type="button" aria-label={`Remove ${f.file.name}`}
                      onClick={() => { release([f]); setFiles((prev) => prev.filter((_, idx) => idx !== i)) }}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white border border-gray-300 text-xs text-gray-700 hover:border-optio-purple">
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Who is in it{tagged.size ? ` (${tagged.size})` : ''}
              </h2>
              {tagged.size > 0 && (
                <button type="button" className="text-sm font-medium text-optio-purple hover:underline"
                  onClick={() => setTagged(new Set())}>
                  Clear
                </button>
              )}
            </div>
            {data.students.length === 0 ? (
              <p className="text-sm text-gray-500">No students yet. Students appear here once they join the school.</p>
            ) : (
              <>
                <input className={INPUT_CLASS} value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search students" aria-label="Search students" />
                <div className="mt-3 flex flex-wrap gap-2 max-h-72 overflow-y-auto">
                  {shown.map((s) => <StudentChip key={s.id} student={s} on={tagged.has(s.id)} onToggle={toggle} />)}
                  {shown.length === 0 && <p className="text-sm text-gray-500">Nobody matches &quot;{search.trim()}&quot;.</p>}
                </div>
              </>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Caption (optional)</span>
              <textarea className={`${INPUT_CLASS} mt-1`} rows={2} maxLength={2000} value={caption}
                onChange={(e) => setCaption(e.target.value)} placeholder="What were they doing?" />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Date</span>
              <input type="date" className={`${INPUT_CLASS} mt-1`} value={eventDate} max={localToday()}
                onChange={(e) => setEventDate(e.target.value)} />
            </label>
          </section>

          <div className="flex justify-end">
            <Button onClick={submit} loading={save.isPending} disabled={save.isPending || tagged.size === 0}>
              {tagged.size ? `Save to ${plural(tagged.size, 'journal', 'journals')}` : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {data && data.recent.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Recent</h2>
          <ul className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {data.recent.map((c) => <RecentCapture key={c.id} capture={c} />)}
          </ul>
        </div>
      )}
    </div>
  )
}

export default PhotosPage
