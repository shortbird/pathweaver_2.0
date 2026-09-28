import React, { useEffect, useRef, useState } from 'react'
import { bool, func, shape, string } from 'prop-types'
import { toast } from 'react-hot-toast'
import { XMarkIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import { Modal } from '../ui/Modal'
import { Spinner } from '../ui/Spinner'
import { detectMediaType, validateFileSize } from '../../utils/mediaUtils'
import { IMAGE_ACCEPT_STRING, DOCUMENT_ACCEPT_STRING, VIDEO_ACCEPT_STRING } from '../evidence/EvidenceMediaHandlers'
import { sendCheckIn } from './sendCheckIn'

const ACCEPT = `${IMAGE_ACCEPT_STRING},.heic,.heif,${DOCUMENT_ACCEPT_STRING},${VIDEO_ACCEPT_STRING}`

const EXAMPLES = [
  'Photos of finished workbook pages',
  'A test, quiz or answer key with scores',
  'A project, essay or lab write-up',
  'A short video of your student explaining something they learned',
]

/**
 * The one screen a parent uses to show a semester of own-curriculum work.
 *
 * Photos or files plus a sentence, then Send. Staff review it in the credit
 * queue; a check-in sent back for more opens here again with the reviewer's
 * note on top, and whatever is added joins what was already sent.
 */
const CheckInModal = ({ isOpen, onClose, onSent, course, checkIn, studentId, studentName }) => {
  const [files, setFiles] = useState([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [progressText, setProgressText] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setFiles([])
      setNote('')
      setProgressText('')
    }
  }, [isOpen, checkIn?.task_id])

  if (!course || !checkIn) return null

  const needsMore = checkIn.state === 'needs_more'
  const notSent = checkIn.state === 'not_sent'
  const who = studentName || 'your student'
  const canSend = !sending && (files.length > 0 || note.trim().length > 0 || notSent)

  const addFiles = (list) => {
    const accepted = []
    for (const file of Array.from(list || [])) {
      const check = validateFileSize(file, detectMediaType(file))
      if (!check.valid) {
        toast.error(check.error)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted])
  }

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      await sendCheckIn({
        taskId: checkIn.task_id,
        files,
        note,
        studentId,
        onProgress: ({ step, index, total }) => {
          if (step === 'upload') setProgressText(`Uploading ${index + 1} of ${total}`)
          else if (step === 'save') setProgressText('Saving')
          else setProgressText('Sending to Optio')
        },
      })
      toast.success('Check-in sent. We will review it and let you know.')
      onSent?.()
      onClose()
    } catch (err) {
      toast.error(err.message)
      if (err.evidenceSaved) {
        setFiles([])
        setNote('')
        onSent?.()
      }
    } finally {
      setSending(false)
      setProgressText('')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={sending ? () => {} : onClose}
      closeOnOverlayClick={!sending}
      title={`${checkIn.title}: ${course.title}`}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={sending} className="btn-quiet">
            Cancel
          </button>
          <button type="button" onClick={handleSend} disabled={!canSend} className="btn-primary">
            {sending && <Spinner size="sm" className="border-white" />}
            {sending ? progressText || 'Sending' : 'Send for review'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {needsMore && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Optio asked for a little more</p>
            {checkIn.feedback && <p className="mt-1 whitespace-pre-line">{checkIn.feedback}</p>}
            <p className="mt-2 text-amber-800">
              Everything you sent before is still attached. Add what was asked for and send it again.
            </p>
          </div>
        )}

        {notSent && !needsMore && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            Work is already saved on this check-in but it was never sent for review. Send it now, or add more
            first.
          </div>
        )}

        <div>
          <p className="text-sm text-gray-700">
            Show us what {who} finished this semester. You do not need everything, just enough that a
            teacher can see the work was done.
          </p>
          <ul className="mt-2 text-sm text-gray-500 list-disc pl-5 space-y-0.5">
            {EXAMPLES.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700">Photos and files</span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              addFiles(e.dataTransfer.files)
            }}
            disabled={sending}
            className="mt-1 w-full rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-6 text-center hover:border-optio-purple hover:bg-optio-purple/5 transition-all"
          >
            <PaperClipIcon className="w-6 h-6 mx-auto text-gray-400" aria-hidden="true" />
            <span className="mt-2 block text-sm font-medium text-optio-purple">Choose photos or files</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Photos, PDFs, documents or short videos. You can pick several at once.
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            data-testid="check-in-files"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm"
                >
                  <span className="truncate text-gray-800">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    disabled={sending}
                    className="text-gray-400 hover:text-optio-purple"
                    aria-label={`Remove ${f.name}`}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="check-in-note" className="block text-sm font-medium text-gray-700">
            What did they cover?
          </label>
          <textarea
            id="check-in-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={sending}
            placeholder="e.g. Finished lessons 1 to 60, including fractions, decimals and percents."
            className="input-field mt-1 resize-none"
          />
        </div>
      </div>
    </Modal>
  )
}

CheckInModal.propTypes = {
  isOpen: bool.isRequired,
  onClose: func.isRequired,
  onSent: func,
  course: shape({ title: string }),
  checkIn: shape({
    task_id: string,
    title: string,
    state: string,
    feedback: string,
  }),
  studentId: string,
  studentName: string,
}

export default CheckInModal
